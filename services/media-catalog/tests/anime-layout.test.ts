import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { AnimeIndex } from '../src/anime/anime-index';
import { CatalogService, type CatalogValues } from '../src/catalog/catalog.service';
import { AnimeLayoutRepository } from '../src/db/anime-layout.repo';
import { ArtworkRepository } from '../src/db/artwork.repo';
import { BackdropFocusRepository } from '../src/db/backdrop-focus.repo';
import { CatalogDatabase } from '../src/db/database';
import { LocalizationRepository } from '../src/db/localization.repo';
import { MovieRepository } from '../src/db/movie.repo';
import { SyncStateRepository } from '../src/db/sync-state.repo';
import { TVShowRepository } from '../src/db/tv-show.repo';
import type {
  CatalogProvider,
  ProviderChangesPage,
  ProviderSearchPage,
  ProviderSeason,
  ProviderTVShow,
} from '../src/provider/provider';
import { ApiCache } from '../src/utils/api-cache';

const VALUES: CatalogValues = {
  hydrationTtlMs: 24 * 60 * 60 * 1000,
  episodeSyncMode: 'ON_DEMAND',
  backdropFocusConcurrency: 1,
  backdropFocusBackgroundIntervalMs: 20_000,
};
const URLS = { animeLists: 'https://lists.invalid/list.json', aniZip: 'https://anizip.invalid/m' };
const SHOW = 500;
const DAY = 86400_000;
const START = Date.parse('2021-04-11T00:00:00Z');
const date = (day: number) => new Date(START + day * DAY).toISOString().slice(0, 10);

/** An invented show TMDB keeps in one 30-episode season: 12 episodes, a year off, then 18. */
const episodeDay = (index: number) => (index < 12 ? index * 7 : 365 + (index - 12) * 7);
const season: ProviderSeason = {
  tvMediaId: SHOW,
  mediaId: 5001,
  seasonNumber: 1,
  name: 'Season 1',
  overview: '',
  airDate: date(0),
  poster: '/season1.jpg',
  episodes: Array.from({ length: 30 }, (_, i) => ({
    mediaId: 50_000 + i + 1,
    episodeNumber: i + 1,
    name: `Episode ${i + 1}`,
    overview: '',
    airDate: date(episodeDay(i)),
    still: '',
  })),
};
const specials: ProviderSeason = { ...season, mediaId: 5000, seasonNumber: 0, episodes: [] };
const show: ProviderTVShow = {
  mediaId: SHOW,
  imdbId: null,
  name: 'Sorcery Academy',
  overview: '',
  tagline: '',
  firstAirDate: date(0),
  status: 'Returning Series',
  type: 'Scripted',
  inProduction: true,
  poster: '',
  backdrop: '',
  logo: '',
  genreIds: [16],
  episodeRunTime: [],
  popularity: 1,
  rating: 1,
  seasons: [specials, season].map(({ episodes: _, tvMediaId: __, ...summary }) => ({
    ...summary,
    poster: summary.poster ?? '',
  })),
  translations: [],
};

const fribb = [
  { anilist_id: 1, type: 'TV', themoviedb_id: { tv: SHOW }, season: { tmdb: 1, tvdb: 1 } },
  { anilist_id: 2, type: 'TV', themoviedb_id: { tv: SHOW }, season: { tmdb: 1, tvdb: 2 } },
  { anilist_id: 3, type: 'OVA', themoviedb_id: { tv: SHOW }, season: { tmdb: 0 } },
];
const aniZip = (title: string, count: number, firstDay: number) => ({
  titles: { en: title },
  episodes: Object.fromEntries(
    Array.from({ length: count }, (_, i) => [String(i + 1), { airDate: date(firstDay + i * 7) }])
  ),
});
const mappings: Record<string, unknown> = {
  '1': aniZip('Sorcery Academy', 12, 0),
  '2': aniZip('Sorcery Academy: The Second Year', 18, 365),
  '3': aniZip('Sorcery Academy OVA', 1, 100),
};

class Provider implements Partial<CatalogProvider> {
  readonly name = 'fake';
  async getTVShow(): Promise<ProviderTVShow | null> {
    return show;
  }
  async getSeason(_tv: number, seasonNumber: number): Promise<ProviderSeason | null> {
    return seasonNumber === 1 ? season : seasonNumber === 0 ? specials : null;
  }
  async getGenres() {
    return [{ id: 16, name: 'Animation' }];
  }
  async search(): Promise<ProviderSearchPage> {
    return { page: 1, totalPages: 0, totalResults: 0, results: [] };
  }
  async *changedTVShows(): AsyncGenerator<ProviderChangesPage> {}
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const setup = ({
  listGate,
  firstDownloadWaitMs,
}: { listGate?: Promise<void>; firstDownloadWaitMs?: number } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-anime-'));
  dirs.push(dir);
  const db = new CatalogDatabase(dir);
  const requests: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url === URLS.animeLists) {
      await listGate;
      return Response.json(fribb);
    }
    const id = new URL(url).searchParams.get('anilist_id') ?? '';
    return mappings[id] ? Response.json(mappings[id]) : new Response('missing', { status: 404 });
  }) as typeof fetch;
  const layouts = new AnimeLayoutRepository(db);
  const service = new CatalogService(
    new MovieRepository(db),
    new TVShowRepository(db),
    new LocalizationRepository(db),
    new SyncStateRepository(db),
    new Provider() as unknown as CatalogProvider,
    VALUES,
    new BackdropFocusRepository(db),
    new ArtworkRepository(db),
    {
      index: new AnimeIndex(dir, new ApiCache(db), fetchImpl, Date.now, URLS, firstDownloadWaitMs),
      layouts,
    }
  );
  return { db, service, requests };
};

describe('anime seasons by AniList entry', () => {
  it('splits a show TMDB keeps in one season into its AniList entries', async () => {
    const { db, service } = setup();
    const detail = await service.getTVShow(SHOW, 'en');
    expect(detail.seasonLayout).toBe('anilist');
    expect(detail.seasonLayoutVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(
      detail.seasons.map(s => [s.seasonNumber, s.name, s.episodeCount, s.anilistId ?? null])
    ).toEqual([
      [0, 'Season 1', 0, null],
      [1, 'Season 1', 12, 1],
      [2, 'The Second Year', 18, 2],
    ]);
    expect(detail.seasons[2]!.mediaId).toBe(-2);

    const second = await service.getSeason(SHOW, 2, 'en');
    expect(second.episodes).toHaveLength(18);
    expect(second.episodes[0]).toMatchObject({
      mediaId: 50_013,
      episodeNumber: 1,
      providerSeasonNumber: 1,
      providerEpisodeNumber: 13,
      name: 'Episode 13',
    });

    const layout = await service.episodeLayout(SHOW);
    expect(layout.layout).toBe('anilist');
    expect(layout.version).toBe(detail.seasonLayoutVersion!);
    expect(layout.episodes).toHaveLength(30);
    expect(layout.episodes[29]).toEqual({
      mediaId: 50_030,
      seasonNumber: 2,
      episodeNumber: 18,
      providerSeasonNumber: 1,
      providerEpisodeNumber: 30,
    });
    db.close();
  });

  it('does not hold show requests while the first anime list downloads', async () => {
    let release!: () => void;
    const listGate = new Promise<void>(resolve => (release = resolve));
    const { db, service } = setup({ listGate, firstDownloadWaitMs: 20 });

    // The list is still downloading: TMDB's seasons, without waiting for it.
    const started = Date.now();
    const waiting = await service.getTVShow(SHOW, 'en');
    expect(waiting.seasonLayout).toBe('tmdb');
    // Unknown, not TMDB's: consumers keep the numbering they have.
    expect('seasonLayoutVersion' in waiting).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);

    // The download finished in the background; the next request builds the layout.
    release();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect((await service.getTVShow(SHOW, 'en')).seasonLayout).toBe('anilist');
    db.close();
  });

  it('reports an unknown numbering after a failed ani.zip read, and does not retry it per request', async () => {
    const { db, service, requests } = setup();
    const second = mappings['2'];
    delete mappings['2'];
    try {
      const detail = await service.getTVShow(SHOW, 'en');
      expect('seasonLayoutVersion' in detail).toBe(false);
      const reads = requests.filter(url => url.startsWith(URLS.aniZip)).length;

      await service.getTVShow(SHOW, 'en');
      expect(requests.filter(url => url.startsWith(URLS.aniZip))).toHaveLength(reads);
    } finally {
      mappings['2'] = second!;
      db.close();
    }
  });

  it('lists use a stored layout without building one', async () => {
    const { db, service, requests } = setup();
    const before = await service.batch([{ mediaType: 'tv', mediaId: SHOW }], 'en');
    expect(before.items[0]).toMatchObject({ seasonLayout: 'tmdb' });
    expect(requests).toEqual([]);

    await service.getTVShow(SHOW, 'en');
    const after = await service.batch([{ mediaType: 'tv', mediaId: SHOW }], 'en');
    expect(after.items[0]).toMatchObject({ seasonLayout: 'anilist' });
    db.close();
  });

  it('keeps TMDB seasons for shows that are not anime', async () => {
    const { db, service, requests } = setup();
    fribb.splice(0, fribb.length - 1);
    try {
      const detail = await service.getTVShow(SHOW, 'en');
      expect(detail.seasonLayout).toBe('tmdb');
      expect(detail.seasons.map(s => s.seasonNumber)).toEqual([0, 1]);
      expect((await service.getSeason(SHOW, 1, 'en')).episodes).toHaveLength(30);
      expect(await service.episodeLayout(SHOW)).toEqual({
        tvMediaId: SHOW,
        layout: 'tmdb',
        version: null,
        episodes: [],
      });
      // ani.zip is never asked about a show with nothing to split.
      expect(requests.some(url => url.startsWith(URLS.aniZip))).toBe(false);
    } finally {
      db.close();
    }
  });
});
