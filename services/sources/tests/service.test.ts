import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import {
  sources,
  type SourceSearchItem,
  type SourceSearchRequest,
} from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { mergeCandidate, toCandidate } from '../src/normalize/candidate';
import { magnetHash, normalizeHash } from '../src/normalize/magnet';
import { EztvProvider } from '../src/providers/native/eztv';
import { createSourcesService } from '../src/service';

const dirs: string[] = [];
const stops: Array<() => Promise<void>> = [];
const hash = 'a'.repeat(40);
const request: SourceSearchRequest = {
  media: { kind: 'show', tmdbId: 123, imdbId: 'tt1234567', title: 'Example Show' },
  season: 1,
  episode: 1,
  purpose: 'background',
};
const setup = (
  handler: (url: URL, init?: RequestInit) => Promise<Response> | Response,
  now?: () => number
) => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-test-'));
  dirs.push(dir);
  const created = createSourcesService({
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    fetch: ((input: URL | string | Request, init?: RequestInit) =>
      handler(new URL(String(input)), init)) as typeof fetch,
    now,
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  const db = new Database(join(dir, 'sources.sqlite'));
  return {
    client: createClient(sources, transport),
    admin: createClient(management, transport),
    service: created.service,
    db,
    dir,
  };
};
const ready = async (
  admin: ReturnType<typeof setup>['admin'],
  values: Record<string, string> = {}
) =>
  admin.applyConfig({
    values: {
      SOURCES_DISABLE_VPN_CHECK: 'true',
      SOURCES_REQUEST_TIMEOUT_MS: '1000',
      SOURCES_HEDGE_MS: '10',
      SOURCES_MIN_SEEDERS: '5',
      SOURCES_MOVIE_MIN_HEALTHY: '3',
      SOURCES_DEFAULT_DAILY_BUDGET: '2000',
      THE_RARBG_API_URL: 'https://rarbg.invalid',
      YTS_API_URL: 'https://yts.invalid/api/v2',
      ...values,
    },
  });
const collect = async (iter: AsyncIterable<SourceSearchItem>) => {
  const items: SourceSearchItem[] = [];
  for await (const item of iter) items.push(item);
  return items;
};
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('starts in standby and fails closed when VPN is not protected', async () => {
  const { client, admin, service, db } = setup(() => Response.json({ protected: false }));
  expect((await admin.status()).state).toBe('standby');
  const initial = await collect(client.search(request)).catch(e => e);
  expect(isContractError(initial, 'not_configured')).toBe(true);
  await ready(admin, { SOURCES_DISABLE_VPN_CHECK: 'false' });
  const error = await collect(client.search(request)).catch(e => e);
  expect(isContractError(error, 'vpn_required')).toBe(true);
  expect((await service.fetch(new Request('http://x/health'))).status).toBe(200);
  db.close();
});
it('finds an older season pack from paged title search after irrelevant IMDb results, then serves cache', async () => {
  const calls: string[] = [];
  const { client, admin, db } = setup(url => {
    calls.push(url.href);
    if (url.host === 'api.nordvpn.com') return Response.json({ protected: false });
    if (url.pathname.includes('imdb-detail'))
      return Response.json({
        trb_posts: [
          { name: 'Example.Show.S02E08.1080p', info_hash: 'b'.repeat(40), season: 2, episode: 8 },
        ],
        imdb: {},
      });
    if (url.pathname.includes('S01E01'))
      return Response.json({ results: [], links: { next: null } });
    if (url.pathname.includes('S01'))
      return Response.json(
        url.searchParams.get('page') === '2'
          ? {
              results: [
                { n: 'Example.Show.S01.Complete.1080p', h: hash, se: 20, s: 1000, i: 'tt1234567' },
              ],
              links: { next: null },
            }
          : { results: [], links: { next: '?page=2' } }
      );
    throw new Error('Unexpected fixture URL ' + url);
  });
  db.run("UPDATE providers SET enabled=0 WHERE id<>'therarbg'");
  await ready(admin);
  const items = await collect(client.search(request));
  expect(items.filter(i => i.type === 'candidate').map(i => i.candidate.hash)).toEqual([hash]);
  expect(items.at(-1)).toMatchObject({
    type: 'summary',
    providersSearched: ['therarbg'],
    complete: true,
  });
  const before = calls.length;
  expect((await collect(client.search(request))).some(i => i.type === 'candidate')).toBe(true);
  expect(calls.length).toBe(before);
  db.close();
});
it('opens the breaker after three failures and persists cooldown', async () => {
  const { client, admin, db } = setup(url => {
    if (url.host === 'api.nordvpn.com') return Response.json({ protected: false });
    throw new Error('fixture offline');
  });
  db.run("UPDATE providers SET enabled=0 WHERE id<>'eztv'");
  await ready(admin);
  for (let i = 0; i < 3; i++)
    expect((await collect(client.search(request))).at(-1)).toMatchObject({
      providersFailed: ['eztv'],
    });
  expect((await collect(client.search(request))).at(-1)).toMatchObject({
    providersSkipped: ['eztv'],
    complete: false,
  });
  db.close();
});
it('hedges a slow first tier and propagates cancellation to outstanding requests', async () => {
  const calls: string[] = [];
  const abort = new AbortController();
  const { client, admin, db } = setup(async (url, init) => {
    if (url.host === 'api.nordvpn.com') return Response.json({ protected: false });
    calls.push(url.host);
    if (url.host === 'rarbg.invalid')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      );
    return Response.json({
      status: 'ok',
      data: {
        movies: [
          {
            title_long: 'Example Movie (2020)',
            imdb_code: 'tt1234567',
            torrents: [{ hash, url: 'https://file.invalid/a', quality: '1080p', seeds: 20 }],
          },
        ],
      },
    });
  });
  await ready(admin);
  const timer = setTimeout(() => abort.abort(), 100);
  await collect(
    client.search(
      {
        ...request,
        media: { ...request.media, kind: 'movie', title: 'Example Movie', year: 2020 },
        purpose: 'interactive',
      },
      { signal: abort.signal }
    )
  ).catch(() => undefined);
  clearTimeout(timer);
  expect(calls).toContain('yts.invalid');
  db.close();
});
it('reserves background budget and charges every HTTP request', async () => {
  const { client, admin, db } = setup(url =>
    url.host === 'api.nordvpn.com'
      ? Response.json({ protected: false })
      : Response.json({ torrents: [], torrents_count: 0 })
  );
  db.run("UPDATE providers SET enabled=0 WHERE id<>'eztv'");
  await ready(admin, { SOURCES_DEFAULT_DAILY_BUDGET: '1' });
  expect((await collect(client.search(request))).at(-1)).toMatchObject({
    providersSkipped: ['eztv'],
  });
  expect(db.query('SELECT * FROM provider_usage').all()).toHaveLength(0);
  db.close();
});
it('normalizes base32 hashes, rejects invalid hashes and merges stats without changing provider', () => {
  expect(normalizeHash('A'.repeat(32))).toBe('0'.repeat(40));
  expect(magnetHash('magnet:?xt=urn:btih:' + 'A'.repeat(32))).toBe('0'.repeat(40));
  expect(normalizeHash('bad')).toBeNull();
  const p = new EztvProvider();
  expect(
    toCandidate(
      { title: 'Example Show S01E01', hash: 'bad' },
      p,
      'imdb',
      { kind: 'tv' },
      request,
      v => v
    )
  ).toBeNull();
  const a = toCandidate(
    { title: 'Example Show S01E01', hash, seeders: 1 },
    p,
    'imdb',
    { kind: 'tv' },
    request,
    v => v
  )!;
  expect(
    mergeCandidate(a, { ...a, provider: 'other', broadcasters: 8, watchers: 3 })
  ).toMatchObject({ provider: 'eztv', broadcasters: 8, watchers: 3 });
  expect(
    toCandidate(
      { title: 'Example Showdown S01E01', hash },
      p,
      'title',
      { kind: 'tv' },
      request,
      v => v
    )
  ).toBeNull();
});
it('keeps outbound fetch calls confined to http/', () => {
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.ts') && !file.includes('/http/'))
        expect(readFileSync(file, 'utf8')).not.toMatch(/\bfetch\s*\(/);
    }
  };
  visit(join(import.meta.dir, '../src'));
});

it('normalizes a cached ID-only response separately for each requested episode', async () => {
  let requests = 0;
  const { client, admin, db } = setup(url => {
    if (url.host === 'api.nordvpn.com') return Response.json({ protected: false });
    requests++;
    return Response.json({
      torrents_count: 2,
      torrents: [1, 2].map(episode => ({
        title: `Example Show S01E0${episode} 1080p`,
        hash: String(episode).repeat(40),
        season: '1',
        episode: String(episode),
        seeds: 10,
        size_bytes: '1000',
        date_released_unix: 0,
      })),
    });
  });
  db.run("UPDATE providers SET enabled=0 WHERE id<>'eztv'");
  await ready(admin);
  expect((await collect(client.search(request))).find(i => i.type === 'candidate')).toMatchObject({
    candidate: { episode: 1 },
  });
  expect(
    (await collect(client.search({ ...request, episode: 2 }))).find(i => i.type === 'candidate')
  ).toMatchObject({ candidate: { episode: 2 } });
  expect(requests).toBe(1);
  db.close();
});

it('preserves season zero specials', () => {
  const c = toCandidate(
    { title: 'Example Show S00E01', hash, season: 0, episode: 1 },
    new EztvProvider(),
    'imdb',
    { kind: 'tv' },
    { ...request, season: 0 },
    v => v
  );
  expect(c).toMatchObject({ season: 0, episode: 1, batch: false });
});
it('spreads background searches across equally ranked providers by remaining budget', async () => {
  let time = Date.now();
  const calls: string[] = [];
  const { client, admin, db } = setup(
    url => {
      calls.push(url.host);
      if (url.host === 'rarbg.invalid')
        return Response.json({
          trb_posts: [
            { name: 'Example Movie 2020 1080p', info_hash: 'a'.repeat(40), seeders: 20 },
            { name: 'Example Movie 2020 720p', info_hash: 'b'.repeat(40), seeders: 20 },
            { name: 'Example Movie 2020 2160p', info_hash: 'c'.repeat(40), seeders: 20 },
          ],
        });
      return Response.json({
        status: 'ok',
        data: {
          movies: [
            {
              title_long: 'Another Movie 2020',
              imdb_code: 'tt7654321',
              torrents: ['d', 'e', 'f'].map(h => ({
                hash: h.repeat(40),
                quality: '1080p',
                seeds: 20,
              })),
            },
          ],
        },
      });
    },
    () => time
  );
  db.run("UPDATE providers SET priority=10 WHERE id IN ('therarbg','yts')");
  db.run("UPDATE providers SET enabled=0 WHERE id='eztv'");
  await ready(admin);
  await collect(
    client.search({
      ...request,
      media: { kind: 'movie', tmdbId: 1, imdbId: 'tt1234567', title: 'Example Movie', year: 2020 },
    })
  );
  time += 60_000;
  await collect(
    client.search({
      ...request,
      media: { kind: 'movie', tmdbId: 2, imdbId: 'tt7654321', title: 'Another Movie', year: 2020 },
    })
  );
  expect(calls).toEqual(['rarbg.invalid', 'yts.invalid']);
  db.close();
});

it('keeps the interactive budget reserve usable while the same background query is rejected', async () => {
  const { client, admin, db } = setup(() =>
    Response.json({
      torrents_count: 1,
      torrents: [
        {
          title: 'Example Show S01E01 1080p',
          hash,
          season: '1',
          episode: '1',
          seeds: 10,
          size_bytes: '1000',
          date_released_unix: 0,
        },
      ],
    })
  );
  db.run("UPDATE providers SET enabled=0 WHERE id<>'eztv'");
  await ready(admin, { SOURCES_DEFAULT_DAILY_BUDGET: '1' });
  const [background, interactive] = await Promise.all([
    collect(client.search(request)),
    collect(client.search({ ...request, purpose: 'interactive' })),
  ]);
  expect(background.at(-1)).toMatchObject({ providersSkipped: ['eztv'] });
  expect(interactive.find(i => i.type === 'candidate')).toMatchObject({ candidate: { hash } });
  db.close();
});
