import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import { CatalogHydrator } from '../src/catalog/catalog.hydrator';
import { CatalogService, type CatalogValues } from '../src/catalog/catalog.service';
import { CatalogSynchronizer } from '../src/catalog/catalog.syncer';
import { SYNC_STATE_MOVIES } from '../src/db/catalog-db.types';
import { CatalogDatabase } from '../src/db/database';
import { ListRepository } from '../src/db/list.repo';
import { LocalizationRepository } from '../src/db/localization.repo';
import { MovieRepository } from '../src/db/movie.repo';
import { movies } from '../src/db/schema';
import { SyncStateRepository } from '../src/db/sync-state.repo';
import { TVShowRepository } from '../src/db/tv-show.repo';
import { HttpError } from '../src/errors';
import type {
  CatalogProvider,
  ProviderChangesPage,
  ProviderGenre,
  ProviderListPage,
  ProviderMovie,
  ProviderSeason,
  ProviderSummary,
  ProviderTVShow,
} from '../src/provider/provider';
import { ProviderError } from '../src/provider/provider';
import type { ListDefinition } from '../src/types';

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

class FakeProvider implements CatalogProvider {
  readonly name = 'fake';
  movies = new Map<number, ProviderMovie>();
  failingMovies = new Set<number>();
  movieCalls = 0;
  listCalls = 0;
  genreCalls = 0;
  seasons = new Map<string, ProviderSeason>();
  changedIds: number[] = [];

  async test(): Promise<boolean> {
    return true;
  }

  listDefinitions(): ListDefinition[] {
    return [{ slug: 'fake-list', name: 'Fake List', description: '' }];
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
    return this.seasons.get(`${tvMediaId}:${seasonNumber}`) ?? null;
  }

  async getListPage(slug: string, page: number): Promise<ProviderListPage> {
    this.listCalls++;
    const items: ProviderSummary[] = [...this.movies.values()].map(movie => ({
      mediaType: 'movie',
      mediaId: movie.mediaId,
      title: movie.title,
      overview: movie.overview,
      poster: movie.poster,
      backdrop: movie.backdrop,
      genreIds: movie.genreIds,
      releaseDate: movie.releaseDate,
      popularity: movie.popularity,
      rating: movie.rating,
    }));
    return { page, totalPages: 1, totalItems: items.length, items };
  }

  async getGenres(_language: string): Promise<ProviderGenre[]> {
    this.genreCalls++;
    return [{ id: 28, name: 'Action' }];
  }

  async *changedMovies(): AsyncGenerator<ProviderChangesPage> {
    yield { page: 1, totalPages: 1, items: this.changedIds };
  }

  async *changedTVShows(): AsyncGenerator<ProviderChangesPage> {
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
    lists: new ListRepository(db),
    syncState: new SyncStateRepository(db),
  };
  const provider = new FakeProvider();
  const service = new CatalogService(
    repo.movies,
    repo.tvShows,
    repo.localization,
    repo.lists,
    repo.syncState,
    provider,
    VALUES
  );
  return {
    db,
    repo,
    provider,
    service,
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
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
    repo.syncState.setLastSync(SYNC_STATE_MOVIES, new Date(Date.now() - 2 * 60 * 60 * 1000));
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

  it('supports focused movie persistence through the entity repository', () => {
    const { repo, cleanup } = setup();

    repo.movies.upsertMovie(makeMovie(603));

    expect(repo.movies.getMovie(603)?.title).toBe('Movie 603');
    cleanup();
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
    expect(service.getMovie(404, 'en')).rejects.toThrow(HttpError);
    try {
      await service.getMovie(404, 'en');
    } catch (error) {
      expect((error as HttpError).status).toBe(404);
    }
    cleanup();
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
    cleanup();
  });

  it('caches list pages and serves definitions', async () => {
    const { repo, provider, service, cleanup } = setup();
    provider.movies.set(603, makeMovie(603));
    repo.lists.upsertListDefinitions(provider.listDefinitions(), provider.name);

    const first = await service.getListPage('fake-list', 1, 'en');
    expect(first.totalItems).toBe(1);
    await service.getListPage('fake-list', 1, 'en');
    expect(provider.listCalls).toBe(1); // second read served from cache

    const definitions = await service.listDefinitions();
    expect(definitions).toEqual([{ slug: 'fake-list', name: 'Fake List', description: '' }]);
    cleanup();
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
      repo.lists,
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
      repo.lists,
      repo.syncState,
      provider,
      VALUES
    );
    repo.tvShows.markSeasonUnsynced(100, 1);
    db.setWatching([]);
    await greedy.syncIncompleteSeasons();
    expect(repo.tvShows.getSeasonWithEpisodes(100, 1)?.episodes).toHaveLength(1);
    cleanup();
  });
});
