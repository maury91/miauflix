import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, localTransport, management } from '@miauflix/contract';
import {
  sources,
  type SourceSearchItem,
  type SourceSearchRequest,
} from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { AnimeLists } from '../src/anime/anime-lists';
import { episodeAliases, matchAnimeRelease } from '../src/anime/release';
import { type AnimeContext, AnimeResolver } from '../src/anime/resolver';
import { openDatabase } from '../src/db/database';
import { Store } from '../src/db/store';
import { HttpClient } from '../src/http/http-client';
import { toCandidate } from '../src/normalize/candidate';
import { variantsFor } from '../src/planner/query-variants';
import { parseDefinition } from '../src/providers/cardigann/definition';
import { CardigannProvider } from '../src/providers/cardigann/engine';
import type { Provider } from '../src/providers/types';
import { createSourcesService } from '../src/service';
import { fixtureFetch, fixtureResolver } from './http-fixture';
import { useProviders } from './providers';

const NOW = Date.parse('2026-08-02T12:00:00Z');
const LISTS = 'https://lists.invalid/anime-list.json';
const ANI_ZIP = 'https://mappings.invalid/mappings';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// An invented show: TMDB keeps one season of 30 episodes, AniList splits it in two cours
// (12 + 18), and the second cour is TVDB's season 2. There is also a film.
const fribb = [
  {
    type: 'TV',
    anilist_id: 1001,
    anidb_id: 501,
    themoviedb_id: { tv: 900 },
    season: { tvdb: 1, tmdb: 1 },
  },
  {
    type: 'TV',
    anilist_id: 1002,
    anidb_id: 502,
    themoviedb_id: { tv: 900 },
    season: { tvdb: 2, tmdb: 1 },
  },
  { type: 'SPECIAL', anilist_id: 1003, anidb_id: 503, themoviedb_id: { tv: 900 } },
  { type: 'MOVIE', anilist_id: 1004, anidb_id: 504, themoviedb_id: { movie: [77] } },
  { type: 'TV', anilist_id: 1005, anidb_id: 505 },
];
const day = (offset: number) => new Date(Date.UTC(2024, 0, 6) + offset * 86400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const aniZip = (anilistId: number) => {
  const cour2 = anilistId === 1002;
  const count = cour2 ? 18 : 12;
  const first = cour2 ? 20 : 0; // weeks after the first episode
  const episodes = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      String(i + 1),
      {
        anidbEid: anilistId * 100 + i + 1,
        seasonNumber: cour2 ? 2 : 1,
        episodeNumber: i + 1,
        absoluteEpisodeNumber: (cour2 ? 12 : 0) + i + 1,
        airDate: iso(day((first + i) * 7)),
      },
    ])
  );
  return {
    titles: {
      'x-jat': cour2 ? 'Majutsu Gakuen 2nd Season' : 'Majutsu Gakuen',
      en: cour2 ? 'Sorcery Academy Season 2' : 'Sorcery Academy',
      ja: '魔術学園',
    },
    episodes: { ...episodes, S1: { anidbEid: 9 } },
    episodeCount: count,
  };
};

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'anime-'));
  dirs.push(dir);
  const calls: string[] = [];
  const http = new HttpClient(
    { timeout: () => 2000, flareSolverr: () => '' },
    fixtureFetch(url => {
      calls.push(url.href);
      if (url.href === LISTS) return Response.json(fribb);
      if (url.href.startsWith(ANI_ZIP))
        return Response.json(aniZip(Number(url.searchParams.get('anilist_id'))));
      return new Response('unexpected', { status: 500 });
    }),
    () => NOW,
    fixtureResolver
  );
  const store = new Store(
    openDatabase(dir),
    s => s,
    s => s,
    () => NOW
  );
  const resolver = new AnimeResolver(
    new AnimeLists(dir, http, () => NOW, LISTS),
    store,
    http,
    () => NOW,
    ANI_ZIP
  );
  return { dir, http, store, resolver, calls };
};
const show = (episode: number, airDate?: string): SourceSearchRequest => ({
  media: { kind: 'show', tmdbId: 900, imdbId: null, title: 'Sorcery Academy', year: 2024 },
  season: 1,
  episode,
  airDate,
  purpose: 'interactive',
});
const signal = () => new AbortController().signal;

it('places a TMDB episode in its AniList cour by air date', async () => {
  const { resolver } = setup();
  // TMDB's episode 13 is the second cour's first, aired 20 weeks after the premiere.
  const anime = await resolver.resolve(show(13, iso(day(140))), signal());
  expect(anime).toEqual({
    titles: [
      'Majutsu Gakuen 2nd Season',
      'Sorcery Academy Season 2',
      'Majutsu Gakuen',
      'Sorcery Academy',
    ],
    seasonTitles: ['Majutsu Gakuen 2nd Season', 'Sorcery Academy Season 2'],
    anilistId: 1002,
    anidbAid: 502,
    episode: {
      anidbEid: 100201,
      number: 1,
      absolute: 13,
      releaseSeason: 2,
      tvdb: { season: 2, episode: 1 },
      entryEpisodes: 18,
      year: 2024,
    },
  });
});

it('tolerates a day of difference in air dates and falls back to episode order', async () => {
  const { resolver } = setup();
  expect((await resolver.resolve(show(3, iso(day(15))), signal()))?.episode?.number).toBe(3);
  // Without an air date: twelve in the first cour, so TMDB's 15th is the second cour's 3rd.
  expect((await resolver.resolve(show(15), signal()))?.episode).toMatchObject({
    number: 3,
    absolute: 15,
  });
});

it('maps anime films and leaves other titles alone', async () => {
  const { resolver } = setup();
  expect(
    await resolver.resolve(
      {
        media: { kind: 'movie', tmdbId: 77, imdbId: null, title: 'Sorcery Academy: The Movie' },
        purpose: 'interactive',
      },
      signal()
    )
  ).toMatchObject({ anilistId: 1004, anidbAid: 504 });
  expect(
    await resolver.resolve({ ...show(1), media: { ...show(1).media, tmdbId: 1 } }, signal())
  ).toBeNull();
});

it('keeps the anime list on disk and the mappings in the cache', async () => {
  const { dir, http, store, resolver, calls } = setup();
  await resolver.resolve(show(2, iso(day(7))), signal());
  await resolver.resolve(show(2, iso(day(7))), signal());
  expect(calls.filter(c => c === LISTS)).toHaveLength(1);
  expect(calls.filter(c => c.startsWith(ANI_ZIP))).toHaveLength(2);
  // A restarted service reads the saved copy instead of downloading it again.
  const restarted = new AnimeResolver(
    new AnimeLists(dir, http, () => NOW, LISTS),
    store,
    http,
    () => NOW,
    ANI_ZIP
  );
  expect((await restarted.resolve(show(2, iso(day(7))), signal()))?.anilistId).toBe(1001);
  expect(calls.filter(c => c === LISTS)).toHaveLength(1);
});

it('is not anime when the list cannot be read', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anime-'));
  dirs.push(dir);
  const http = new HttpClient(
    { timeout: () => 2000, flareSolverr: () => '' },
    fixtureFetch(() => new Response('down', { status: 503 })),
    () => NOW,
    fixtureResolver
  );
  const store = new Store(
    openDatabase(dir),
    s => s,
    s => s,
    () => NOW
  );
  const resolver = new AnimeResolver(new AnimeLists(dir, http, () => NOW, LISTS), store, http);
  expect(await resolver.resolve(show(1), signal())).toBeNull();
});

const secondCour: AnimeContext = {
  titles: ['Majutsu Gakuen 2nd Season', 'Majutsu Gakuen'],
  seasonTitles: ['Majutsu Gakuen 2nd Season'],
  anilistId: 1002,
  anidbAid: 502,
  episode: {
    anidbEid: 100207,
    number: 7,
    absolute: 19,
    releaseSeason: 2,
    tvdb: { season: 2, episode: 7 },
    entryEpisodes: 18,
    year: 2024,
  },
};
const tmdb19 = { season: 1, episode: 19 };

it.each([
  ['[Group] Majutsu Gakuen 2nd Season - 07 [1080p].mkv', 'episode'],
  ['[Group] Majutsu Gakuen S2 - 07v2 [1080p]', 'episode'],
  ['[Group] Majutsu Gakuen - 19 [1080p]', 'episode'],
  ['[Group] Majutsu Gakuen - 19 (Season 2) [1080p]', 'episode'],
  ['Majutsu Gakuen S02E07 1080p WEB-DL', 'episode'],
  ['Majutsu Gakuen S01E19 1080p WEB-DL', 'episode'],
  ['[Group] Majutsu Gakuen S2 - 01 ~ 18 [Batch]', 'pack'],
  ['[Group] Majutsu Gakuen Season 2 [BD 1080p]', 'pack'],
  ['[Group] Majutsu Gakuen (13-30) [Batch]', 'pack'],
  ['[Group] Majutsu Gakuen - 07 [1080p]', null],
  ['[Group] Majutsu Gakuen S3 - 07 [1080p]', null],
  ['[Group] Majutsu Gakuen (2026) - 07 [1080p]', null],
  ['[Group] Majutsu Gakuen - 01 ~ 12 [Batch]', null],
  ['[Group] Majutsu Gakuen S2 - NCOP1 [1080p]', null],
] as const)('reads %s for the second cour', (name, expected) => {
  expect(matchAnimeRelease(name, secondCour, tmdb19, false, 2024)).toBe(expected);
});

it('reads a season named by its own title or year', () => {
  expect(matchAnimeRelease('[Group] Majutsu Gakuen Ni - 07', secondCour, tmdb19, true)).toBe(
    'episode'
  );
  const withYear = { ...secondCour, episode: { ...secondCour.episode!, year: 2025 } };
  expect(
    matchAnimeRelease('[Group] Majutsu Gakuen (2025) - 07', withYear, tmdb19, false, 2024)
  ).toBe('episode');
});

it('lists the numberings a pack may give the episode', () => {
  expect(episodeAliases(secondCour, tmdb19)).toEqual([{ season: 2, episode: 7 }, { episode: 19 }]);
});

const animeProvider = (caps: Provider['caps']): Provider =>
  ({ id: 'anime', name: 'Anime', kind: 'cardigann', caps }) as Provider;

it('searches by AniDB episode id first, then by the entry titles', () => {
  const request = show(19);
  const variants = variantsFor(
    animeProvider({ movie: [], tv: [], anime: ['q', 'anidbEid', 'anidbAid'] }),
    request,
    secondCour
  );
  expect(variants.map(v => [v.matchedBy, v.query])).toEqual([
    ['anidb', { kind: 'anime', anidbEid: 100207 }],
    ['title', { kind: 'anime', q: 'Majutsu Gakuen 2nd Season 07' }],
    ['title', { kind: 'anime', q: 'Majutsu Gakuen 2nd Season 19' }],
    ['title', { kind: 'anime', q: 'Majutsu Gakuen 07' }],
    ['title', { kind: 'anime', q: 'Majutsu Gakuen 19' }],
    ['title', { kind: 'anime', q: 'Sorcery Academy 07' }],
    ['title', { kind: 'anime', q: 'Sorcery Academy 19' }],
    ['title', { kind: 'anime', q: 'Sorcery Academy S01E19' }],
    ['title', { kind: 'anime', q: 'Sorcery Academy S01' }],
    ['title', { kind: 'anime', q: 'Sorcery Academy Season 1' }],
  ]);
  // A provider without anime search keeps its usual TV queries.
  expect(
    variantsFor(animeProvider({ movie: [], tv: ['q'], anime: [] }), request, secondCour).map(
      v => v.query.q
    )
  ).toEqual(['Sorcery Academy S01E19', 'Sorcery Academy S01', 'Sorcery Academy Season 1']);
});

it('reports anime matches in TMDB numbering, with the other numberings for packs', () => {
  const provider = animeProvider({ movie: [], tv: [], anime: ['q'] });
  const candidate = (title: string) =>
    toCandidate(
      { title, hash: 'a'.repeat(40) },
      provider,
      'title',
      { kind: 'anime', q: 'Majutsu Gakuen 2nd Season 07' },
      show(19),
      s => s,
      secondCour
    );
  expect(candidate('[Group] Majutsu Gakuen 2nd Season - 07 [1080p]')).toMatchObject({
    season: 1,
    episode: 19,
    batch: false,
    episodeAliases: [{ season: 2, episode: 7 }, { episode: 19 }],
  });
  expect(candidate('[Group] Majutsu Gakuen S2 - 01 ~ 18 [Batch]')).toMatchObject({
    season: 1,
    episode: undefined,
    batch: true,
  });
  expect(candidate('[Group] Majutsu Gakuen - 07 [1080p]')).toBeNull();
  expect(candidate('[Group] Unrelated Show S2 - 07 [1080p]')).toBeNull();
  expect(
    toCandidate(
      { title: '[Group] Majutsu Gakuen S2 Artbook', hash: 'b'.repeat(40), category: 'Books' },
      provider,
      'anidb',
      { kind: 'anime', anidbEid: 100207 },
      show(19),
      s => s,
      secondCour
    )
  ).toBeNull();
});

it('passes AniDB ids to a definition and reads curated releases', async () => {
  const definition = parseDefinition(
    readFileSync(join(import.meta.dir, 'fixtures/cardigann/anime-ids.yml'), 'utf8')
  );
  const provider = new CardigannProvider('test-animeids', 'Anime IDs', definition, {}, () => NOW);
  expect(provider.caps).toEqual({ movie: [], tv: [], anime: ['q', 'anidbEid', 'anidbAid'] });
  const urls: string[] = [];
  const http = new HttpClient(
    { timeout: () => 2000, flareSolverr: () => '' },
    fixtureFetch(url => {
      urls.push(url.search);
      return Response.json([
        {
          title: '[Group] Majutsu Gakuen S2 - 07 [1080p]',
          info_hash: 'C'.repeat(40),
          total_size: 1_000_000,
          seeders: 4,
          timestamp: 1_780_000_000,
          is_curated: true,
        },
        {
          title: '[Other] Majutsu Gakuen S2 - 07 [720p]',
          info_hash: 'D'.repeat(40),
          total_size: 500_000,
          seeders: 2,
          timestamp: 1_780_000_000,
          is_curated: false,
        },
      ]);
    }),
    () => NOW,
    fixtureResolver
  );
  const page = await provider.search(
    { kind: 'anime', anidbEid: 100207 },
    { http, signal: signal() }
  );
  await provider.search({ kind: 'anime', anidbAid: 502 }, { http, signal: signal() });
  await provider.search({ kind: 'anime', q: 'Majutsu Gakuen 07' }, { http, signal: signal() });
  expect(urls).toEqual(['?eid=100207', '?aid=502', '?q=Majutsu%20Gakuen%2007']);
  expect(page.results.map(r => [r.hash, r.release, r.seeders])).toEqual([
    ['c'.repeat(40), 'best', 4],
    ['d'.repeat(40), undefined, 2],
  ]);
});

it('searches an anime episode end to end and reports it in TMDB numbering', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anime-service-'));
  dirs.push(dir);
  const feed: string[] = [];
  const created = createSourcesService({
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    resolveHost: fixtureResolver,
    animeListsUrl: LISTS,
    aniZipUrl: ANI_ZIP,
    fetch: fixtureFetch(url => {
      if (url.href === LISTS) return Response.json(fribb);
      if (url.href.startsWith(ANI_ZIP))
        return Response.json(aniZip(Number(url.searchParams.get('anilist_id'))));
      if (url.host === 'animeids.invalid') {
        feed.push(url.search);
        return Response.json(
          url.searchParams.get('eid') === '100207'
            ? [
                {
                  title: '[Group] Majutsu Gakuen S2 - 07 [1080p]',
                  info_hash: 'C'.repeat(40),
                  total_size: 1_000_000_000,
                  seeders: 40,
                  timestamp: 1_780_000_000,
                  is_curated: true,
                },
                {
                  title: '[Group] Majutsu Gakuen S3 - 07 [1080p]',
                  info_hash: 'D'.repeat(40),
                  total_size: 1_000_000_000,
                  seeders: 40,
                  timestamp: 1_780_000_000,
                },
              ]
            : []
        );
      }
      return new Response('unexpected', { status: 500 });
    }),
  });
  try {
    const transport = localTransport(created.service);
    const db = new Database(join(dir, 'sources.sqlite'));
    useProviders(db, [
      {
        id: 'animeids',
        yaml: readFileSync(join(import.meta.dir, 'fixtures/cardigann/anime-ids.yml'), 'utf8'),
        priority: 10,
      },
    ]);
    db.close();
    await createClient(management, transport).applyConfig({
      values: { SOURCES_DISABLE_VPN_CHECK: 'true', SOURCES_MIN_SEEDERS: '5' },
    });
    const items: SourceSearchItem[] = [];
    // TMDB's episode 19 aired 26 weeks after the premiere: the second cour's 7th.
    for await (const item of createClient(sources, transport).search(show(19, iso(day(182)))))
      items.push(item);
    expect(feed[0]).toBe('?eid=100207');
    expect(items.filter(i => i.type === 'candidate')).toEqual([
      {
        type: 'candidate',
        candidate: expect.objectContaining({
          hash: 'c'.repeat(40),
          provider: 'test-animeids',
          matchedBy: 'anidb',
          accuracy: 'high',
          season: 1,
          episode: 19,
          release: 'best',
          episodeAliases: [{ season: 2, episode: 7 }, { episode: 19 }],
        }),
      },
    ]);
  } finally {
    await created.stop();
  }
});
