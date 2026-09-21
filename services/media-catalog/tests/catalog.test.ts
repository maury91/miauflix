import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, spyOn } from 'bun:test';
import { eq } from 'drizzle-orm';

import { CatalogHydrator } from '../src/catalog/catalog.hydrator';
import { CatalogService, type CatalogValues } from '../src/catalog/catalog.service';
import { CatalogSynchronizer } from '../src/catalog/catalog.syncer';
import { SYNC_STATE_MOVIES, SYNC_STATE_TV_SHOWS } from '../src/db/catalog-db.types';
import { CatalogDatabase } from '../src/db/database';
import { LocalizationRepository } from '../src/db/localization.repo';
import { MovieRepository } from '../src/db/movie.repo';
import { episodes, movies, tvShows } from '../src/db/schema';
import { SyncStateRepository } from '../src/db/sync-state.repo';
import { TVShowRepository } from '../src/db/tv-show.repo';
import { HttpError } from '../src/errors';
import { logger } from '../src/logger';
import type {
  CatalogProvider,
  ProviderChangesPage,
  ProviderGenre,
  ProviderMovie,
  ProviderSeason,
  ProviderTVShow,
} from '../src/provider/provider';
import { ProviderError } from '../src/provider/provider';

const VALUES: CatalogValues = { hydrationTtlMs: 24 * 60 * 60 * 1000, episodeSyncMode: 'GREEDY' };

const makeMovie = (mediaId: number, title = `Movie ${mediaId}`): ProviderMovie => ({
  mediaId,
  imdbId: `tt${String(mediaId).padStart(7, '0')}`,
  title,
  overview: 'overview',
  tagline: 'tagline',
  releaseDate: '1999-03-31',
  runtime: 120,
  poster: 'https://img/poster.jpg',
  backdrop: 'https://img/backdrop.jpg',
  logo: '',
  genreIds: [28],
  popularity: 10,
  rating: 7.5,
  translations: [
    { language: 'it', title: `Titolo ${mediaId}`, overview: 'trama', tagline: 'motto' },
  ],
});

const makeSeason = (): ProviderSeason => ({
  tvMediaId: 100,
  mediaId: 1000,
  seasonNumber: 1,
  name: 'Season 1',
  overview: '',
  airDate: null,
  poster: '',
  episodes: [
    { mediaId: 10000, episodeNumber: 1, name: 'Pilot', overview: '', airDate: null, still: '' },
  ],
});

const makeTVShow = (seasons: ProviderTVShow['seasons']): ProviderTVShow => ({
  mediaId: 100,
  imdbId: 'tt0000100',
  name: 'Show 100',
  overview: '',
  tagline: '',
  firstAirDate: '2000-01-01',
  status: 'Returning Series',
  type: 'Scripted',
  inProduction: true,
  poster: '',
  backdrop: '',
  logo: '',
  genreIds: [],
  episodeRunTime: [],
  popularity: 1,
  rating: 1,
  seasons,
  translations: [],
});

class FakeProvider implements CatalogProvider {
  readonly name = 'fake';
  movies = new Map<number, ProviderMovie>();
  failingMovies = new Set<number>();
  movieCalls = 0;
  genreCalls = 0;
  seasonCalls = 0;
  changedMovieCalls = 0;
  changedTVShowCalls = 0;
  seasons = new Map<string, ProviderSeason>();
  changedIds: number[] = [];

  async test(): Promise<boolean> {
    return true;
  }

  async resolveExternal(): Promise<number | null> {
    return null;
  }

  async getMovie(mediaId: number): Promise<ProviderMovie | null> {
    this.movieCalls++;
    if (this.failingMovies.has(mediaId)) throw new ProviderError('upstream down', 500);
    return this.movies.get(mediaId) ?? null;
  }

  async getTVShow(_mediaId: number): Promise<ProviderTVShow | null> {
    return null;
  }

  async getSeason(tvMediaId: number, seasonNumber: number): Promise<ProviderSeason | null> {
    this.seasonCalls++;
    return this.seasons.get(`${tvMediaId}:${seasonNumber}`) ?? null;
  }

  async getGenres(language: string): Promise<ProviderGenre[]> {
    this.genreCalls++;
    return [{ id: 28, name: language === 'it' ? 'Azione' : 'Action' }];
  }

  async *changedMovies(): AsyncGenerator<ProviderChangesPage> {
    this.changedMovieCalls++;
    yield { page: 1, totalPages: 1, items: this.changedIds };
  }

  async *changedTVShows(): AsyncGenerator<ProviderChangesPage> {
    this.changedTVShowCalls++;
    yield { page: 1, totalPages: 1, items: [] };
  }

  async seasonChanges(): Promise<number[]> {
    return [];
  }
}

const setup = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'catalog-service-'));
  const db = new CatalogDatabase(dataDir);
  const repo = {
    movies: new MovieRepository(db),
    tvShows: new TVShowRepository(db),
    localization: new LocalizationRepository(db),
    syncState: new SyncStateRepository(db),
  };
  const provider = new FakeProvider();
  const service = new CatalogService(
    repo.movies,
    repo.tvShows,
    repo.localization,
    repo.syncState,
    provider,
    VALUES
  );
  return {
    db,
    repo,
    provider,
    service,
    cleanup: () => {
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
};

describe('CatalogService', () => {
  it('hydrates movies through the focused hydration component', async () => {
    const { repo, provider, cleanup } = setup();
    provider.movies.set(603, makeMovie(603));
    const hydrator = new CatalogHydrator(
      repo.movies,
      repo.tvShows,
      provider,
      VALUES.hydrationTtlMs
    );

    await hydrator.ensureMovieFresh(603);

    expect(repo.movies.getMovie(603)?.title).toBe('Movie 603');
    cleanup();
  });

  it('runs change scans through the focused synchronizer', async () => {
    const { repo, provider, cleanup } = setup();
    provider.movies.set(603, makeMovie(603));
    repo.movies.upsertMovie(makeMovie(603));
    provider.changedIds = [603];
    provider.movies.set(603, makeMovie(603, 'Updated Title'));
    const synchronizer = new CatalogSynchronizer(
      repo.movies,
      repo.tvShows,
      repo.syncState,
      provider,
      'GREEDY'
    );

    await synchronizer.syncMovies();

    expect(repo.movies.getMovie(603)?.title).toBe('Updated Title');
    cleanup();
  });

  it('baselines empty catalogs without requesting provider change feeds', async () => {
    const { repo, provider, service, cleanup } = setup();
    try {
      const startedAt = Date.now();

      await service.syncMovies();
      await service.syncTVShows();

      expect(provider.changedMovieCalls).toBe(0);
      expect(provider.changedTVShowCalls).toBe(0);
      expect(repo.syncState.getLastSync(SYNC_STATE_MOVIES)?.getTime()).toBeGreaterThanOrEqual(
        startedAt
      );
      expect(repo.syncState.getLastSync(SYNC_STATE_TV_SHOWS)?.getTime()).toBeGreaterThanOrEqual(
        startedAt
      );

      repo.syncState.setLastSync(SYNC_STATE_MOVIES, new Date(0));
      await service.syncMovies();

      expect(provider.changedMovieCalls).toBe(0);
      expect(repo.syncState.getLastSync(SYNC_STATE_MOVIES)?.getTime()).toBeGreaterThanOrEqual(
        startedAt
      );
    } finally {
      cleanup();
    }
  });

  it('supports focused movie persistence through the entity repository', () => {
    const { repo, cleanup } = setup();

    repo.movies.upsertMovie(makeMovie(603));

    expect(repo.movies.getMovie(603)?.title).toBe('Movie 603');
    cleanup();
  });

  it('reconciles authoritative season and episode snapshots, including replaced numbers', () => {
    const { db, repo, cleanup } = setup();
    try {
      repo.tvShows.upsertTVShow(
        makeTVShow([
          {
            mediaId: 1000,
            seasonNumber: 1,
            name: 'Original',
            overview: '',
            airDate: null,
            poster: '',
          },
          {
            mediaId: 2000,
            seasonNumber: 2,
            name: 'Removed',
            overview: '',
            airDate: null,
            poster: '',
          },
        ])
      );
      repo.tvShows.upsertSeasonWithEpisodes({
        ...makeSeason(),
        episodes: [
          {
            mediaId: 10000,
            episodeNumber: 1,
            name: 'Old one',
            overview: '',
            airDate: null,
            still: '',
          },
          {
            mediaId: 10001,
            episodeNumber: 2,
            name: 'Old two',
            overview: '',
            airDate: null,
            still: '',
          },
        ],
      });
      repo.tvShows.upsertSeasonWithEpisodes({
        ...makeSeason(),
        mediaId: 2000,
        seasonNumber: 2,
        episodes: [
          {
            mediaId: 20000,
            episodeNumber: 1,
            name: 'Removed',
            overview: '',
            airDate: null,
            still: '',
          },
        ],
      });

      repo.tvShows.upsertTVShow(
        makeTVShow([
          {
            mediaId: 1001,
            seasonNumber: 1,
            name: 'Replacement',
            overview: '',
            airDate: null,
            poster: '',
          },
        ])
      );

      expect(repo.tvShows.getSeasonsOf(100).map(season => season.media_id)).toEqual([1001]);
      expect(db.db.select({ mediaId: episodes.mediaId }).from(episodes).all()).toEqual([]);

      repo.tvShows.upsertSeasonWithEpisodes({
        ...makeSeason(),
        mediaId: 1001,
        episodes: [
          {
            mediaId: 11000,
            episodeNumber: 1,
            name: 'Old one',
            overview: '',
            airDate: null,
            still: '',
          },
          {
            mediaId: 11001,
            episodeNumber: 2,
            name: 'Omitted',
            overview: '',
            airDate: null,
            still: '',
          },
        ],
      });
      repo.tvShows.upsertSeasonWithEpisodes({
        ...makeSeason(),
        mediaId: 1001,
        episodes: [
          {
            mediaId: 12001,
            episodeNumber: 1,
            name: 'Replacement',
            overview: '',
            airDate: null,
            still: '',
          },
        ],
      });

      expect(repo.tvShows.getSeasonWithEpisodes(100, 1)?.episodes).toMatchObject([
        { media_id: 12001, episode_number: 1, name: 'Replacement' },
      ]);
    } finally {
      cleanup();
    }
  });

  it('fetches on first read, then serves from the store within the TTL', async () => {
    const { provider, service, cleanup } = setup();
    provider.movies.set(603, makeMovie(603));

    const detail = await service.getMovie(603, 'en');
    expect(detail.title).toBe('Movie 603');
    expect(detail.imdbId).toBe('tt0000603');
    expect(detail.mediaType).toBe('movie');
    expect(provider.movieCalls).toBe(1);

    await service.getMovie(603, 'en');
    expect(provider.movieCalls).toBe(1); // served fresh from the store

    const translated = await service.getMovie(603, 'it');
    expect(translated.title).toBe('Titolo 603');
    cleanup();
  });

  it('localizes genre names after ensuring translations', async () => {
    const { service, cleanup } = setup();
    const provider = service['provider'] as FakeProvider;
    provider.movies.set(603, makeMovie(603));

    const detail = await service.getMovie(603, 'en');
    expect(detail.genres).toEqual([{ id: 28, name: 'Action' }]);
    cleanup();
  });

  it('answers 404 for media unknown to the provider', async () => {
    const { service, cleanup } = setup();
    await expect(service.getMovie(404, 'en')).rejects.toThrow(HttpError);
    try {
      await service.getMovie(404, 'en');
    } catch (error) {
      expect((error as HttpError).status).toBe(404);
    }
    cleanup();
  });

  it('answers 404 when the provider no longer has a stale movie', async () => {
    const { db, repo, service, cleanup } = setup();
    try {
      repo.movies.upsertMovie(makeMovie(603));
      db.db
        .update(movies)
        .set({ detailsSyncedAt: Date.now() - 48 * 60 * 60 * 1000 })
        .where(eq(movies.mediaId, 603))
        .run();

      await expect(service.getMovie(603, 'en')).rejects.toMatchObject({ status: 404 });
    } finally {
      cleanup();
    }
  });

  it('answers 404 when the provider no longer has a stale TV show', async () => {
    const { db, repo, service, cleanup } = setup();
    try {
      repo.tvShows.upsertTVShow(makeTVShow([]));
      db.db
        .update(tvShows)
        .set({ detailsSyncedAt: Date.now() - 48 * 60 * 60 * 1000 })
        .where(eq(tvShows.mediaId, 100))
        .run();

      await expect(service.getTVShow(100, 'en')).rejects.toMatchObject({ status: 404 });
    } finally {
      cleanup();
    }
  });

  it('serves stale data when a refresh fails, but still has the row', async () => {
    const { db, provider, service, cleanup } = setup();
    provider.movies.set(603, makeMovie(603, 'Original'));
    await service.getMovie(603, 'en');

    // Age the stored details past the TTL, then break the upstream.
    db.db
      .update(movies)
      .set({ detailsSyncedAt: Date.now() - 48 * 60 * 60 * 1000 })
      .where(eq(movies.mediaId, 603))
      .run();
    provider.failingMovies.add(603);

    const stale = await service.getMovie(603, 'en');
    expect(stale.title).toBe('Original');
    cleanup();
  });

  it('batches reads and reports missing refs', async () => {
    const { provider, service, cleanup } = setup();
    provider.movies.set(603, makeMovie(603));
    provider.movies.set(604, makeMovie(604));

    const result = await service.batch(
      [
        { mediaType: 'movie', mediaId: 603 },
        { mediaType: 'movie', mediaId: 604 },
        { mediaType: 'movie', mediaId: 999 },
      ],
      'en'
    );
    expect(result.items.map(item => item.mediaId).sort()).toEqual([603, 604]);
    expect(result.missing).toEqual([{ mediaType: 'movie', mediaId: 999 }]);
    expect(result.errors).toEqual([]);
    cleanup();
  });

  it('propagates provider failures from batch reads', async () => {
    const { provider, service, cleanup } = setup();
    provider.failingMovies.add(605);
    const errorLog = spyOn(logger, 'error').mockImplementation(() => {});

    try {
      const result = await service.batch([{ mediaType: 'movie', mediaId: 605 }], 'en');
      expect(result).toMatchObject({
        items: [],
        missing: [],
        errors: [{ ref: { mediaType: 'movie', mediaId: 605 }, error: 'catalog_batch_item_failed' }],
      });
      expect(errorLog).toHaveBeenCalledWith(
        'CatalogService',
        'Batch item failed for movie 605',
        expect.objectContaining({ message: 'upstream down' })
      );
    } finally {
      errorLog.mockRestore();
      cleanup();
    }
  });

  it('reuses persisted genres when every known genre has the requested translation', async () => {
    const { repo, provider, service, cleanup } = setup();
    try {
      repo.localization.upsertGenres([{ id: 28, name: 'Action' }], 'en');
      repo.localization.upsertGenres([{ id: 28, name: 'Azione' }], 'it');

      expect(await service.getGenres('it')).toEqual([{ id: 28, name: 'Azione' }]);
      expect(provider.genreCalls).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('fetches missing genre translations once and then serves the persisted locale', async () => {
    const { repo, provider, service, cleanup } = setup();
    try {
      repo.localization.upsertGenres([{ id: 28, name: 'Action' }], 'en');

      expect(await service.getGenres('it')).toEqual([{ id: 28, name: 'Azione' }]);
      expect(await service.getGenres('it')).toEqual([{ id: 28, name: 'Azione' }]);
      expect(provider.genreCalls).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('coalesces concurrent stale season refreshes into one provider call', async () => {
    const { repo, provider, cleanup } = setup();
    try {
      repo.tvShows.upsertSeasonWithEpisodes(makeSeason());
      repo.tvShows.markSeasonUnsynced(100, 1);
      provider.seasons.set('100:1', { ...makeSeason(), name: 'Updated season' });
      const hydrator = new CatalogHydrator(
        repo.movies,
        repo.tvShows,
        provider,
        VALUES.hydrationTtlMs
      );

      const entries = await Promise.all([
        hydrator.ensureSeasonFresh(100, 1),
        hydrator.ensureSeasonFresh(100, 1),
      ]);

      expect(entries.map(entry => entry.season.name)).toEqual(['Updated season', 'Updated season']);
      expect(provider.seasonCalls).toBe(1);
      expect(repo.tvShows.getSeasonRow(100, 1)?.synced).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('reselects invalidated seasons with existing episodes and respects the watching filter', () => {
    const { db, repo, cleanup } = setup();
    try {
      repo.tvShows.upsertSeasonWithEpisodes(makeSeason());
      expect(repo.tvShows.findIncompleteSeason(false)).toBeUndefined();
      repo.tvShows.markSeasonUnsynced(100, 1);

      expect(repo.tvShows.findIncompleteSeason(false)?.media_id).toBe(1000);
      expect(repo.tvShows.findIncompleteSeason(true)).toBeUndefined();
      db.setWatching([100]);
      expect(repo.tvShows.findIncompleteSeason(true)?.media_id).toBe(1000);
    } finally {
      cleanup();
    }
  });

  it('syncs changes only for locally-known media', async () => {
    const { repo, provider, service, cleanup } = setup();
    provider.movies.set(603, makeMovie(603));
    await service.getMovie(603, 'en'); // 603 is now locally known
    const callsAfterHydration = provider.movieCalls;

    // A 2h-old watermark produces a single sync window ending "now".
    repo.syncState.setLastSync(SYNC_STATE_MOVIES, new Date(Date.now() - 2 * 60 * 60 * 1000));
    provider.movies.set(603, makeMovie(603, 'Updated Title'));
    provider.changedIds = [603, 999]; // 999 is unknown locally — must be skipped
    await service.syncMovies();

    expect(provider.movieCalls).toBe(callsAfterHydration + 1);
    expect(repo.movies.getMovie(603)?.title).toBe('Updated Title');

    // A sync right after another one is throttled by the 1 hour minimum interval.
    provider.changedIds = [603];
    await service.syncMovies();
    expect(provider.movieCalls).toBe(callsAfterHydration + 1);
    cleanup();
  });

  it('syncs incomplete seasons for watching shows in ON_DEMAND mode', async () => {
    const { db, repo, provider, cleanup } = setup();
    // Seed a tv show with one unsynced season.
    repo.tvShows.upsertTVShow({
      mediaId: 100,
      imdbId: null,
      name: 'Show',
      overview: '',
      tagline: '',
      firstAirDate: '',
      status: '',
      type: '',
      inProduction: false,
      poster: '',
      backdrop: '',
      genreIds: [],
      episodeRunTime: [],
      popularity: 0,
      rating: 0,
      seasons: [
        { mediaId: 1000, seasonNumber: 1, name: 'S1', overview: '', airDate: null, poster: '' },
      ],
      translations: [],
    });
    provider.seasons.set('100:1', {
      tvMediaId: 100,
      mediaId: 1000,
      seasonNumber: 1,
      name: 'S1',
      overview: '',
      airDate: null,
      poster: '',
      episodes: [
        { mediaId: 10000, episodeNumber: 1, name: 'E1', overview: '', airDate: null, still: '' },
      ],
    });

    // ON_DEMAND: the show is not watching — nothing happens.
    const onDemand = new CatalogService(
      repo.movies,
      repo.tvShows,
      repo.localization,
      repo.syncState,
      provider,
      {
        ...VALUES,
        episodeSyncMode: 'ON_DEMAND',
      }
    );
    await onDemand.syncIncompleteSeasons();
    expect(repo.tvShows.getSeasonWithEpisodes(100, 1)?.episodes).toHaveLength(0);

    // Mark watching → the season gets its episodes.
    db.setWatching([100]);
    await onDemand.syncIncompleteSeasons();
    const synced = repo.tvShows.getSeasonWithEpisodes(100, 1);
    expect(synced?.episodes).toHaveLength(1);
    expect(synced?.season.synced).toBe(1);

    // GREEDY: runs even without watching flags.
    const greedy = new CatalogService(
      repo.movies,
      repo.tvShows,
      repo.localization,
      repo.syncState,
      provider,
      VALUES
    );
    repo.tvShows.markSeasonUnsynced(100, 1);
    db.setWatching([]);
    await greedy.syncIncompleteSeasons();
    expect(repo.tvShows.getSeasonWithEpisodes(100, 1)?.episodes).toHaveLength(1);
    expect(repo.tvShows.getSeasonRow(100, 1)?.synced).toBe(1);
    cleanup();
  });
});
