import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { migrations, TORRENTIO_ID } from '../src/db/migrations';
import { HttpClient } from '../src/http/http-client';
import {
  capsOf,
  normalizeManifestUrl,
  parseManifest,
  streamToResult,
  StremioProvider,
} from '../src/providers/stremio/stremio';
import { createSourcesService } from '../src/service';
import { createSeal } from '../src/util/seal';
import { fixtureFetch, fixtureResolver } from './http-fixture';

// Small synthetic addon answers in the shapes public addons use; no real addon data.
const TORRENT_ADDON = {
  id: 'org.example.torrents',
  version: '1.0.0',
  name: 'Example Torrents',
  description: 'Finds torrents by IMDb id\nSecond line',
  types: ['movie', 'series'],
  catalogs: [],
  resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }],
  behaviorHints: { configurable: true },
};
const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const STREAMS = {
  streams: [
    {
      name: 'Example\n1080p',
      title: 'Example.Movie.2020.1080p.BluRay.x264-GRP\n👤 42 💾 2.5 GB ⚙️ SiteA',
      infoHash: HASH_A,
      fileIdx: 0,
      sources: ['tracker:udp://tracker.example:1337/announce', 'dht:' + HASH_A],
      behaviorHints: { bingeGroup: 'x', filename: 'Example.Movie.2020.1080p.BluRay.x264-GRP.mkv' },
    },
    {
      name: 'Example 720p',
      description: '📂 Example.Movie.2020.720p.WEB-DL\n💾 900 MB 👤 7',
      infoHash: HASH_B.toUpperCase(),
    },
    // Debrid and direct links are not torrents: skipped until sources can be HTTP.
    { name: 'Example [RD+]', title: 'Example.Movie.2020.2160p', url: 'https://debrid.example/x' },
    { name: 'Trailer', ytId: 'abc' },
  ],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const http = (handler: (url: URL) => Response | Promise<Response>) =>
  new HttpClient(
    { timeout: () => 2000, flareSolverr: () => '' },
    fixtureFetch(url => handler(url)),
    Date.now,
    fixtureResolver
  );
const ctx = (client: HttpClient) => ({ http: client, signal: new AbortController().signal });

const dirs: string[] = [];
const stops: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const service = (handler: (url: URL) => Response | Promise<Response>, dir?: string) => {
  const dataDir = dir ?? mkdtempSync(join(tmpdir(), 'sources-stremio-'));
  if (!dir) dirs.push(dataDir);
  const created = createSourcesService({
    animeListsUrl: '',
    dataDir,
    resolveHost: fixtureResolver,
    keyFile: join(dataDir, '.key'),
    encryptionKey: 'test',
    fetch: fixtureFetch(url => handler(url)),
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  return {
    client: createClient(sources, transport),
    ready: () =>
      createClient(management, transport).applyConfig({
        values: { SOURCES_DISABLE_VPN_CHECK: 'true', SOURCES_HEDGE_MS: '10' },
      }),
  };
};
const rejectsWith = async (promise: Promise<unknown>, code: 'bad_request', text?: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(isContractError(error, code)).toBe(true);
  if (text) expect((error as Error).message).toContain(text);
};

it('reads install links in every form addons publish them', () => {
  expect(normalizeManifestUrl('stremio://addon.example/opts/manifest.json').href).toBe(
    'https://addon.example/opts/manifest.json'
  );
  expect(normalizeManifestUrl(' https://addon.example/opts/ ').href).toBe(
    'https://addon.example/opts/manifest.json'
  );
  expect(normalizeManifestUrl('https://addon.example/a|b=c/manifest.json#x').href).toBe(
    'https://addon.example/a|b=c/manifest.json'
  );
  expect(() => normalizeManifestUrl('ftp://addon.example/manifest.json')).toThrow();
  expect(() => normalizeManifestUrl('https://user:pw@addon.example/manifest.json')).toThrow();
});

it('offers movie and series search only for addons that stream by IMDb id', () => {
  expect(capsOf(parseManifest(TORRENT_ADDON))).toEqual({
    movie: ['imdbid'],
    tv: ['imdbid', 'season', 'ep'],
    anime: [],
  });
  // A plain "stream" resource inherits the manifest's types and prefixes.
  expect(
    capsOf(
      parseManifest({ id: 'a', name: 'A', types: ['movie'], resources: ['catalog', 'stream'] })
    )
  ).toEqual({ movie: ['imdbid'], tv: [], anime: [] });
  expect(
    capsOf(
      parseManifest({
        id: 'k',
        name: 'Kitsu only',
        types: ['series'],
        idPrefixes: ['kitsu:'],
        resources: ['stream'],
      })
    )
  ).toEqual({ movie: [], tv: [], anime: [] });
  expect(
    capsOf(parseManifest({ id: 'c', name: 'Catalog', types: ['movie'], resources: ['catalog'] }))
  ).toEqual({ movie: [], tv: [], anime: [] });
  expect(() => parseManifest({ streams: [] })).toThrow('not a Stremio addon manifest');
});

it('turns torrent streams into results and skips the rest', () => {
  const [first, second, debrid, trailer] = STREAMS.streams.map(stream =>
    streamToResult(stream, 'tt0000001', 'movie')
  );
  expect(first).toMatchObject({
    title: 'Example.Movie.2020.1080p.BluRay.x264-GRP',
    hash: HASH_A,
    seeders: 42,
    size: Math.round(2.5 * 1024 ** 3),
    imdbid: 'tt0000001',
    category: 'Movies',
    files: ['Example.Movie.2020.1080p.BluRay.x264-GRP.mkv'],
  });
  const magnet = new URL(first!.magnet!);
  expect(magnet.searchParams.get('xt')).toBe(`urn:btih:${HASH_A}`);
  expect(magnet.searchParams.getAll('tr')).toEqual(['udp://tracker.example:1337/announce']);
  expect(second).toMatchObject({
    title: 'Example.Movie.2020.720p.WEB-DL',
    hash: HASH_B,
    seeders: 7,
    size: 900 * 1024 ** 2,
  });
  expect(debrid).toBeNull();
  expect(trailer).toBeNull();
  // Without a size in the text, the file's size stands in.
  expect(
    streamToResult(
      { infoHash: HASH_A, title: 'Name', behaviorHints: { videoSize: 1234 } },
      'tt1',
      'tv'
    )
  ).toMatchObject({ title: 'Name', size: 1234, category: 'TV' });
});

it('asks the addon for a movie or one episode, by IMDb id', async () => {
  const requests: string[] = [];
  const client = http(url => {
    requests.push(url.href);
    return url.pathname.endsWith('/manifest.json') ? json(TORRENT_ADDON) : json(STREAMS);
  });
  const provider = new StremioProvider(
    'stremio-x',
    'Example',
    'https://addon.example/opts=1/manifest.json'
  );
  await provider.prepare(ctx(client));
  expect(provider.description).toBe('Finds torrents by IMDb id');
  const movie = await provider.search({ kind: 'movie', imdbid: '0000001' }, ctx(client));
  expect(movie.results.map(result => result.hash)).toEqual([HASH_A, HASH_B]);
  await provider.search({ kind: 'tv', imdbid: 'tt0000002', season: 3, ep: 4 }, ctx(client));
  await provider.search({ kind: 'tv', imdbid: 'tt0000002', season: 2 }, ctx(client));
  expect(await provider.search({ kind: 'anime', imdbid: 'tt0000002', ep: 1 }, ctx(client))).toEqual(
    { results: [], hasMore: false }
  );
  expect(requests).toEqual([
    'https://addon.example/opts=1/manifest.json',
    'https://addon.example/opts=1/stream/movie/tt0000001.json',
    'https://addon.example/opts=1/stream/series/tt0000002:3:4.json',
    'https://addon.example/opts=1/stream/series/tt0000002:2:1.json',
  ]);
  const failing = http(() => json({}, 503));
  await expect(provider.search({ kind: 'movie', imdbid: 'tt1' }, ctx(failing))).rejects.toThrow(
    '503'
  );
  expect(await provider.test(ctx(failing))).toMatchObject({ success: false });
  expect(await provider.test(ctx(client))).toEqual({
    success: true,
    message: 'Connected to Example Torrents',
  });
});

it('adds an addon from its install link and keeps the link secret', async () => {
  const { client, ready } = service(url => {
    if (url.host === 'kitsu.example')
      return json({
        id: 'k',
        name: 'K',
        types: ['series'],
        idPrefixes: ['kitsu:'],
        resources: ['stream'],
      });
    if (url.host === 'down.example') return json({}, 500);
    return json(TORRENT_ADDON);
  });
  await ready();
  const view = await client.addStremioProvider({
    url: 'stremio://addon.example/secret-key=123/manifest.json',
  });
  expect(view).toMatchObject({
    id: 'stremio-org-example-torrents',
    name: 'Example Torrents',
    kind: 'stremio',
    enabled: false,
    repositoryId: 'local:user',
    caps: { movie: ['imdbid'], tv: ['imdbid', 'season', 'ep'], anime: [] },
    settings: { manifestUrl: '••••' },
  });
  await rejectsWith(
    client.addStremioProvider({ url: 'https://addon.example/secret-key=123/' }),
    'bad_request',
    'already added'
  );
  await rejectsWith(
    client.addStremioProvider({ url: 'https://kitsu.example/manifest.json' }),
    'bad_request',
    'IMDb'
  );
  await rejectsWith(
    client.addStremioProvider({ url: 'https://down.example/manifest.json' }),
    'bad_request',
    '500'
  );
  await rejectsWith(client.addStremioProvider({ url: 'not a url' }), 'bad_request');
  // A reconfigured addon gets a new link; an invalid one is refused.
  await rejectsWith(
    client.updateProvider({ id: view.id, settings: { manifestUrl: 'ftp://x/manifest.json' } }),
    'bad_request'
  );
  await client.updateProvider({
    id: view.id,
    settings: { manifestUrl: 'stremio://addon.example/secret-key=456/manifest.json' },
  });
  expect((await client.testProvider({ id: view.id })).success).toBe(true);
  const enabled = await client.updateProvider({ id: view.id, enabled: true });
  expect(enabled.enabled).toBe(true);
  // A second copy with other settings gets its own id.
  const other = await client.addStremioProvider({
    url: 'https://addon.example/other/manifest.json',
    name: 'Other copy',
  });
  expect(other).toMatchObject({ id: 'stremio-org-example-torrents-2', name: 'Other copy' });
});

it('moves the Cardigann Torrentio and its options to the Stremio addon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-torrentio-'));
  dirs.push(dir);
  const previous = migrations.length - 1;
  const old = new Database(join(dir, 'sources.sqlite'));
  for (const migration of migrations.slice(0, previous)) old.run(migration);
  old.run(`PRAGMA user_version = ${previous}`);
  const { seal } = createSeal(join(dir, '.key'), 'test');
  old
    .query(
      "INSERT INTO providers (id,kind,repository_id,name,definition,enabled,priority,settings) VALUES (?,'cardigann','builtin:miauflix','Torrentio',?,1,12,?)"
    )
    .run(
      TORRENTIO_ID,
      JSON.stringify({ cardigann: 'torrentio', source: 'x' }),
      seal(JSON.stringify({ options: 'providers=yts|sort=size', dailyBudget: '50' }))
    );
  old
    .query('INSERT INTO query_cache (provider_id,query_key,payload,expires_at) VALUES (?,?,?,?)')
    .run(TORRENTIO_ID, 'k', 'p', Date.now() + 60_000);
  old.close();
  const requests: string[] = [];
  const { client, ready } = service(url => {
    requests.push(url.href);
    return json({ ...TORRENT_ADDON, name: 'Torrentio' });
  }, dir);
  await ready();
  const torrentio = (await client.providers()).find(p => p.id === TORRENTIO_ID)!;
  expect(torrentio).toMatchObject({
    kind: 'stremio',
    enabled: true,
    priority: 12,
    settings: { manifestUrl: '••••', dailyBudget: '50' },
  });
  expect(await client.testProvider({ id: TORRENTIO_ID })).toMatchObject({ success: true });
  expect(requests).toContain('https://torrentio.strem.fun/providers=yts|sort=size/manifest.json');
  const db = new Database(join(dir, 'sources.sqlite'));
  expect(db.query('SELECT COUNT(*) AS n FROM query_cache').get()).toEqual({ n: 0 });
  db.close();
});
