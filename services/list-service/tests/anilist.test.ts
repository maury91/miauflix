import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import { AniListLists, currentSeason } from '../src/anilist';
import { listPage } from '../src/list-page-cache';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const URLS = { anilist: 'https://anilist.invalid/', animeLists: 'https://lists.invalid/ids.json' };
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Two cours of one invented show, a film, an entry TMDB lacks and a film known only by IMDb.
const fribb = [
  { anilist_id: 11, themoviedb_id: { tv: 900 } },
  { anilist_id: 12, themoviedb_id: { tv: 900 } },
  { anilist_id: 13, themoviedb_id: { movie: [77] }, imdb_id: ['tt0000077'] },
  { anilist_id: 14 },
  { anilist_id: 15, imdb_id: 'tt0000015' },
];
const media = [
  { id: 12, format: 'TV' },
  { id: 11, format: 'TV' },
  { id: 13, format: 'MOVIE' },
  { id: 14, format: 'ONA' },
  { id: 15, format: 'MOVIE' },
];

const setup = (anilistStatus = 200) => {
  const dir = mkdtempSync(join(tmpdir(), 'anilist-'));
  dirs.push(dir);
  const calls: { url: string; variables?: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === URLS.animeLists) {
      calls.push({ url });
      return Response.json(fribb);
    }
    const body = JSON.parse(String(init?.body)) as { variables: Record<string, unknown> };
    calls.push({ url, variables: body.variables });
    if (anilistStatus !== 200) return new Response('busy', { status: anilistStatus });
    return Response.json({
      data: { Page: { pageInfo: { total: 120, lastPage: 3 }, media } },
    });
  }) as typeof fetch;
  return { dir, calls, aniList: new AniListLists(dir, fetchImpl, () => NOW, URLS) };
};

describe('AniList lists', () => {
  it.each([
    ['2026-01-15', 'WINTER', 2026],
    ['2026-04-01', 'SPRING', 2026],
    ['2026-08-31', 'SUMMER', 2026],
    ['2026-11-07', 'FALL', 2026],
    ['2026-12-20', 'WINTER', 2027],
  ])('places %s in the %s %d season', (date, season, seasonYear) => {
    expect(currentSeason(new Date(date))).toEqual({ season, seasonYear });
  });

  it('asks AniList for this season and maps entries to TMDB', async () => {
    const { aniList, calls } = setup();
    const page = await aniList.page('anilist-season-popular', 2);
    expect(calls.find(c => c.url === URLS.anilist)?.variables).toEqual({
      page: 2,
      perPage: 50,
      sort: ['POPULARITY_DESC'],
      season: 'FALL',
      seasonYear: 2026,
    });
    expect(page).toEqual({
      items: [
        { show: { ids: { tmdb: 900 } } },
        { show: { ids: { tmdb: 900 } } },
        { movie: { ids: { tmdb: 77, imdb: 'tt0000077' } } },
        { movie: { ids: { tmdb: null, imdb: 'tt0000015' } } },
      ],
      totalItems: 120,
      totalPages: 3,
    });
  });

  it('serves one row per show and keeps the id list on disk', async () => {
    const { dir, aniList, calls } = setup();
    const database = new Database(':memory:');
    database.run(`CREATE TABLE list_pages (
      subject_id TEXT NOT NULL, list_id TEXT NOT NULL, page INTEGER NOT NULL,
      payload TEXT NOT NULL, fetched_at INTEGER NOT NULL,
      PRIMARY KEY (subject_id, list_id, page)
    )`);
    const result = await listPage({
      database,
      listId: 'anilist-trending',
      page: 1,
      association: () => null,
      accessToken: async () => 'unused',
      fetchPage: async () => {
        throw new Error('Trakt is not used');
      },
      seal: value => value,
      open: value => value,
      aniList,
    });
    expect(result.items.map((item: { media: unknown }) => item.media)).toEqual([
      { mediaType: 'tv', ids: { tmdb: 900 } },
      { mediaType: 'movie', ids: { tmdb: 77, imdb: 'tt0000077' } },
      { mediaType: 'movie', ids: { imdb: 'tt0000015' } },
    ]);
    database.close();
    // A restarted service reads the saved ids instead of downloading them again.
    const restarted = new AniListLists(
      dir,
      (async () => Response.json({ data: { Page: { media } } })) as unknown as typeof fetch,
      () => NOW,
      URLS
    );
    expect((await restarted.page('anilist-all-time-popular', 1)).items).toHaveLength(4);
    expect(calls.filter(c => c.url === URLS.animeLists)).toHaveLength(1);
  });

  it('fails a page AniList does not answer', async () => {
    const { aniList } = setup(429);
    await expect(aniList.page('anilist-trending', 1)).rejects.toThrow('AniList HTTP 429');
    await expect(aniList.page('unknown', 1)).rejects.toThrow('List not found');
  });

  it('does not take inherited names for lists', async () => {
    const { aniList } = setup();
    expect(aniList.has('constructor')).toBe(false);
    await expect(aniList.page('toString', 1)).rejects.toThrow('List not found');
  });

  it('serves a stale id list while it refreshes, and waits before retrying a failed refresh', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'anilist-'));
    dirs.push(dir);
    let now = NOW;
    let listDownloads = 0;
    let finishDownload: (response: Response) => void = () => undefined;
    const fetchImpl = (async (input: string | URL | Request) => {
      if (String(input) === URLS.animeLists) {
        listDownloads++;
        // The first download succeeds; later ones hang until told to fail.
        if (listDownloads === 1) return Response.json(fribb);
        return new Promise<Response>(resolve => {
          finishDownload = resolve;
        });
      }
      return Response.json({ data: { Page: { media } } });
    }) as typeof fetch;
    const aniList = new AniListLists(dir, fetchImpl, () => now, URLS);
    expect((await aniList.page('anilist-trending', 1)).items).toHaveLength(4);

    now += 8 * 86400_000;
    // The refresh is still running, yet the page is served from the old copy.
    expect((await aniList.page('anilist-trending', 1)).items).toHaveLength(4);
    expect(listDownloads).toBe(2);
    finishDownload(new Response('down', { status: 503 }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect((await aniList.page('anilist-trending', 1)).items).toHaveLength(4);
    expect(listDownloads).toBe(2);
    now += 3600_000;
    await aniList.page('anilist-trending', 1);
    expect(listDownloads).toBe(3);
  });
});
