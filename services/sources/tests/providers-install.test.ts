import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it, spyOn } from 'bun:test';
import { parse } from 'yaml';

import { createSourcesService } from '../src/service';

const dirs: string[] = [];
const stops: Array<() => Promise<void>> = [];
const definition = (name: string) =>
  readFileSync(join(import.meta.dir, 'fixtures/cardigann', name), 'utf8');
const setup = (
  handler: (url: URL) => Response | Promise<Response>,
  definitionsUrl = 'https://defs.invalid/definitions'
) => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-install-'));
  dirs.push(dir);
  const created = createSourcesService({
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    fetch: ((input: URL | string | Request) => handler(new URL(String(input)))) as typeof fetch,
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  const admin = createClient(management, transport);
  return {
    client: createClient(sources, transport),
    db: new Database(join(dir, 'sources.sqlite')),
    ready: () =>
      admin.applyConfig({
        values: {
          SOURCES_DISABLE_VPN_CHECK: 'true',
          CARDIGANN_DEFINITION_SOURCES: definitionsUrl,
        },
      }),
  };
};
const rejectsWith = async (promise: Promise<unknown>, code: 'bad_request' | 'not_found') => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(isContractError(error, code)).toBe(true);
};
const definitions = (url: URL) => {
  const name = url.pathname.split('/').pop()!;
  if (name === 'index.json') return Response.json(['jsonapi', 'private-site', 'weird', 'broken']);
  if (name === 'broken.yml') return new Response('id: [', { status: 200 });
  const file = {
    'jsonapi.yml': 'json-api.yml',
    'private-site.yml': 'private-tracker.yml',
    'weird.yml': 'unsupported-filter.yml',
  }[name];
  return file ? new Response(definition(file)) : new Response('missing', { status: 404 });
};
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('enables a built-in Prowlarr provider by fetching its definition, and reports unsupported ones', async () => {
  const { client, ready, db } = setup(
    url =>
      url.pathname.endsWith('/nyaasi.yml')
        ? new Response(definition('json-api.yml'))
        : url.pathname.endsWith('/thepiratebay.yml')
          ? new Response(definition('private-tracker.yml'))
          : new Response('missing', { status: 404 }),
    PROWLARR_URL
  );
  await ready();
  const enabled = await client.updateProvider({ id: 'prowlarr-nyaasi', enabled: true });
  expect(enabled.enabled).toBe(true);
  expect(db.query('SELECT source, id FROM cardigann_definitions').all()).toEqual([
    { source: 'Prowlarr/Indexers@master:definitions/v11', id: 'nyaasi' },
  ]);
  await rejectsWith(
    client.updateProvider({ id: 'prowlarr-thepiratebay', enabled: true }),
    'bad_request'
  );
  await rejectsWith(client.updateProvider({ id: 'prowlarr-eztv', enabled: true }), 'bad_request');
  const list = await client.providers();
  // The unsupported definition is hidden; one that simply could not be fetched stays visible.
  expect(list.some(p => p.id === 'prowlarr-thepiratebay')).toBe(false);
  expect(list.find(p => p.id === 'prowlarr-eztv')?.enabled).toBe(false);
});

it('tests a Cardigann provider through its own requests', async () => {
  const { client, ready } = setup(
    url =>
      url.host === 'raw.githubusercontent.com' ? definitions(url) : Response.json({ results: [] }),
    DEFS
  );
  await ready();
  await client.addCardigannProvider({ id: 'jsonapi' });
  expect(await client.testProvider({ id: 'jackett-jsonapi' })).toMatchObject({ success: true });
});

it('adds Torznab indexers with a sealed API key and removes only user-added providers', async () => {
  const { client, ready, db } = setup(url =>
    url.searchParams.get('t') === 'caps'
      ? new Response(
          readFileSync(join(import.meta.dir, 'fixtures/torznab/jackett-caps.xml'), 'utf8')
        )
      : new Response('<rss/>')
  );
  await ready();
  const view = await client.addTorznabProvider({
    name: 'My Jackett',
    baseUrl: 'http://jackett:9117/api/v2.0/indexers/all/results/torznab/',
    apiKey: 'super-secret',
  });
  expect(view).toMatchObject({
    id: 'torznab-my-jackett',
    kind: 'torznab',
    repositoryId: 'local:user',
    enabled: false,
  });
  expect(view.settings.apiKey).toBe('••••');
  const raw = db
    .query("SELECT settings, definition FROM providers WHERE id='torznab-my-jackett'")
    .get() as {
    settings: string;
    definition: string;
  };
  expect(raw.settings + raw.definition).not.toContain('super-secret');
  const second = await client.addTorznabProvider({
    name: 'My Jackett',
    baseUrl: 'https://other.invalid/api',
  });
  expect(second.id).toBe('torznab-my-jackett-2');
  await rejectsWith(
    client.addTorznabProvider({ name: '', baseUrl: 'https://x.invalid' }),
    'bad_request'
  );
  await rejectsWith(
    client.addTorznabProvider({ name: 'x', baseUrl: 'ftp://x.invalid' }),
    'bad_request'
  );
  await rejectsWith(
    client.addTorznabProvider({ name: 'x', baseUrl: 'https://u:p@x.invalid' }),
    'bad_request'
  );
  expect((await client.testProvider({ id: view.id })).success).toBe(true);

  await rejectsWith(client.removeRepository({ id: 'local:user' }), 'bad_request');
  await rejectsWith(client.removeProvider({ id: 'prowlarr-yts' }), 'bad_request');
  await rejectsWith(client.removeProvider({ id: 'ghost' }), 'not_found');
  await client.removeProvider({ id: view.id });
  await client.removeProvider({ id: second.id });
  expect((await client.repositories()).some(r => r.id === 'local:user')).toBe(false);
});

const DEFS = 'https://raw.githubusercontent.com/Jackett/Jackett/master/defs';
const PROWLARR_URL = 'https://raw.githubusercontent.com/Prowlarr/Indexers/master/definitions/v11';
/** A fake GitHub: a trees listing plus raw files, counting what is downloaded. */
const github = (
  files: Record<string, { sha: string; yaml: string }>,
  treeSha = { value: 't1' }
) => {
  const downloaded: string[] = [];
  let listings = 0;
  const handler = (url: URL) => {
    if (url.hostname === 'api.github.com') {
      listings++;
      return Response.json({
        sha: treeSha.value,
        tree: [
          ...Object.entries(files).map(([id, file]) => ({
            path: `${id}.yml`,
            type: 'blob',
            sha: file.sha,
          })),
          { path: 'README.md', type: 'blob', sha: 'r' },
        ],
      });
    }
    const id = url.pathname.split('/').pop()!.replace('.yml', '');
    downloaded.push(id);
    return files[id] ? new Response(files[id].yaml) : new Response('missing', { status: 404 });
  };
  return { handler, downloaded, listings: () => listings };
};
const baseFiles = () => ({
  jsonapi: { sha: 'a1', yaml: definition('json-api.yml') },
  'private-site': { sha: 'b1', yaml: definition('private-tracker.yml') },
  weird: { sha: 'c1', yaml: definition('unsupported-filter.yml') },
  broken: { sha: 'd1', yaml: 'id: [' },
});
const wait = async (client: ReturnType<typeof setup>['client']) => {
  await client.syncCardigannDefinitions();
  for (let i = 0; i < 100; i++) {
    const { sync } = await client.cardigannDefinitions({ offset: 0, limit: 0 });
    if (!sync.syncing) return sync;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('sync did not finish');
};
const all = { offset: 0, limit: 100 };

it('syncs the definition list and filters it by what indexers support', async () => {
  const fake = github(baseFiles());
  const { client, ready } = setup(fake.handler, DEFS);
  await ready();
  const sync = await wait(client);
  expect(sync).toMatchObject({
    total: 4,
    ready: 4,
    pending: 0,
    failed: 0,
    lastError: null,
    lastChange: { added: 4, updated: 0, removed: 0, failed: 0 },
    intervalMinutes: 60,
  });
  expect(sync.lastSyncAt).not.toBeNull();

  const everything = await client.cardigannDefinitions(all);
  expect(everything.total).toBe(4);
  expect(everything.entries.map(entry => entry.id)).toEqual([
    'broken',
    'jsonapi',
    'private-site',
    'weird',
  ]);
  const jsonapi = everything.entries.find(entry => entry.id === 'jsonapi')!;
  expect(jsonapi).toMatchObject({
    name: 'JSON API',
    type: 'public',
    language: 'en-US',
    status: 'ready',
    supported: true,
    installed: false,
    supports: { imdb: true, tmdb: false, tvdb: false, movies: true, tv: true, anime: false },
    requiresFlareSolverr: false,
  });
  expect(everything.entries.find(entry => entry.id === 'private-site')).toMatchObject({
    supported: false,
    type: 'private',
    reason: 'Needs an account (private tracker)',
  });
  expect(everything.entries.find(entry => entry.id === 'weird')?.reason).toContain('hexdump');

  const ids = async (query: Partial<Parameters<typeof client.cardigannDefinitions>[0]>) =>
    (await client.cardigannDefinitions({ ...all, ...query })).entries.map(entry => entry.id);
  // Indexers that need an account are listed with what they can do, just not installable.
  expect(await ids({ imdb: true })).toEqual(['jsonapi', 'private-site']);
  expect(await ids({ imdb: true, publicOnly: true })).toEqual(['jsonapi']);
  expect(await ids({ publicOnly: true })).toEqual(['jsonapi', 'weird']);
  expect(await ids({ supportedOnly: true })).toEqual(['jsonapi']);
  expect(await ids({ anime: true })).toEqual([]);
  expect(await ids({ tmdb: true })).toEqual([]);
  expect(await ids({ movies: true, tv: true })).toEqual(['jsonapi', 'weird']);
  expect(await ids({ query: 'JSON' })).toEqual(['jsonapi']);
  expect(await ids({ query: 'private' })).toEqual(['private-site']);
  expect(await ids({ query: '%' })).toEqual([]);
});

it('pages the catalog and validates the request', async () => {
  const files: Record<string, { sha: string; yaml: string }> = {};
  for (let i = 0; i < 25; i++)
    files[`site-${String(i).padStart(2, '0')}`] = {
      sha: `s${i}`,
      yaml: definition('json-api.yml'),
    };
  const { client, ready } = setup(github(files).handler, DEFS);
  await ready();
  await wait(client);
  const first = await client.cardigannDefinitions({ offset: 0, limit: 10 });
  const second = await client.cardigannDefinitions({ offset: 10, limit: 10 });
  const last = await client.cardigannDefinitions({ offset: 20, limit: 10 });
  expect([first.entries.length, second.entries.length, last.entries.length]).toEqual([10, 10, 5]);
  expect(first.total).toBe(25);
  expect(new Set([...first.entries, ...second.entries, ...last.entries].map(e => e.id)).size).toBe(
    25
  );
  expect((await client.cardigannDefinitions({ offset: 0, limit: 0 })).entries).toEqual([]);
  await rejectsWith(client.cardigannDefinitions({ offset: 0, limit: 101 }), 'bad_request');
  await rejectsWith(client.cardigannDefinitions({ offset: -1, limit: 10 }), 'bad_request');
});

it('downloads only what changed, and nothing when the listing is unchanged', async () => {
  const files = baseFiles();
  const tree = { value: 't1' };
  const fake = github(files, tree);
  const { client, ready } = setup(fake.handler, DEFS);
  await ready();
  await wait(client);
  expect(fake.downloaded.sort()).toEqual(['broken', 'jsonapi', 'private-site', 'weird']);

  // Same tree sha: the listing is read, no definition is.
  fake.downloaded.length = 0;
  await wait(client);
  expect(fake.downloaded).toEqual([]);
  expect(fake.listings()).toBe(2);

  // One changed, one added, one removed.
  tree.value = 't2';
  files.jsonapi = {
    sha: 'a2',
    yaml: definition('json-api.yml').replace('name: JSON API', 'name: JSON API v2'),
  };
  (files as Record<string, { sha: string; yaml: string }>).fresh = {
    sha: 'e1',
    yaml: definition('nested-json.yml'),
  };
  delete (files as Record<string, unknown>).weird;
  const sync = await wait(client);
  expect(fake.downloaded.sort()).toEqual(['fresh', 'jsonapi']);
  expect(sync.lastChange).toEqual({ added: 1, updated: 1, removed: 1, failed: 0 });
  expect(sync.total).toBe(4);
  const { entries } = await client.cardigannDefinitions(all);
  // Ordered by name: Broken (no name, so its id), JSON API v2, Nested JSON, Private Site.
  expect(entries.map(e => e.id)).toEqual(['broken', 'jsonapi', 'fresh', 'private-site']);
  expect(entries.find(e => e.id === 'jsonapi')?.name).toBe('JSON API v2');
  expect(entries.find(e => e.id === 'fresh')?.supports.imdb).toBe(true);
});

it('retries what failed and keeps what it knew when a refresh fails', async () => {
  const files = baseFiles();
  const tree = { value: 't1' };
  const fake = github(files, tree);
  let failing = true;
  const { client, ready } = setup(url => {
    if (failing && url.pathname.endsWith('/jsonapi.yml'))
      return new Response('boom', { status: 500 });
    return fake.handler(url);
  }, DEFS);
  await ready();
  expect(await wait(client)).toMatchObject({ failed: 1, ready: 3, lastChange: { failed: 1 } });
  expect((await client.cardigannDefinitions({ ...all, query: 'jsonapi' })).entries[0].status).toBe(
    'failed'
  );
  failing = false;
  fake.downloaded.length = 0;
  expect(await wait(client)).toMatchObject({ failed: 0, ready: 4 });
  expect(fake.downloaded).toEqual(['jsonapi']);

  // A later failure to refresh a known indexer leaves it usable.
  tree.value = 't2';
  files.jsonapi = { sha: 'a2', yaml: files.jsonapi.yaml };
  failing = true;
  await wait(client);
  const entry = (await client.cardigannDefinitions({ ...all, query: 'jsonapi' })).entries[0];
  expect(entry).toMatchObject({ status: 'ready', supported: true, name: 'JSON API' });
});

it('reports a failed sync without losing the catalog', async () => {
  let down = false;
  const fake = github(baseFiles());
  const { client, ready } = setup(
    url => (down ? new Response('no', { status: 503 }) : fake.handler(url)),
    DEFS
  );
  await ready();
  await wait(client);
  down = true;
  const sync = await wait(client);
  expect(sync.lastError).toContain('503');
  expect(sync.total).toBe(4);
  expect((await client.cardigannDefinitions(all)).entries).toHaveLength(4);
});

it('marks installed indexers and installs from the synced list', async () => {
  const { client, ready } = setup(github(baseFiles()).handler, DEFS);
  await ready();
  await wait(client);
  await client.addCardigannProvider({ id: 'jsonapi' });
  const { entries } = await client.cardigannDefinitions({ ...all, imdb: true, publicOnly: true });
  expect(entries).toMatchObject([{ id: 'jsonapi', installed: true }]);
  await rejectsWith(client.addCardigannProvider({ id: 'private-site' }), 'bad_request');
  await rejectsWith(client.addCardigannProvider({ id: 'weird' }), 'bad_request');
  await rejectsWith(client.addCardigannProvider({ id: 'nothing-here' }), 'bad_request');
});

it('updates the definition of an installed indexer when it changes upstream', async () => {
  const files = baseFiles();
  const tree = { value: 't1' };
  const fake = github(files, tree);
  const { client, ready } = setup(fake.handler, DEFS);
  await ready();
  await wait(client);
  await client.addCardigannProvider({ id: 'jsonapi' });
  expect((await client.providers()).find(p => p.id === 'jackett-jsonapi')?.caps.movie).toContain(
    'imdbid'
  );
  tree.value = 't2';
  files.jsonapi = {
    sha: 'a2',
    yaml: definition('json-api.yml').replace('movie-search: [q, imdbid]', 'movie-search: [q]'),
  };
  await wait(client);
  expect(
    (await client.providers()).find(p => p.id === 'jackett-jsonapi')?.caps.movie
  ).not.toContain('imdbid');
});

it('also syncs sources without per-file versions through an index.json', async () => {
  const { client, ready } = setup(definitions);
  await ready();
  const sync = await wait(client);
  expect(sync.total).toBe(4);
  expect(sync.failed).toBe(0);
  expect(
    (await client.cardigannDefinitions({ ...all, imdb: true })).entries.map(e => e.id)
  ).toEqual(['jsonapi', 'private-site']);
});

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const gitIt = hasGit ? it : it.skip;

gitIt('syncs from a git clone: one fetch for the changes, no request per file', async () => {
  const origin = mkdtempSync(join(tmpdir(), 'definitions-origin-'));
  dirs.push(origin);
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      cwd: origin,
      stdio: 'pipe',
    });
  const write = (id: string, yaml: string) => {
    mkdirSync(join(origin, 'defs'), { recursive: true });
    writeFileSync(join(origin, 'defs', `${id}.yml`), yaml);
  };
  git('init', '--quiet', '--initial-branch=master');
  git('config', 'uploadpack.allowFilter', 'true');
  git('config', 'uploadpack.allowAnySHA1InWant', 'true');
  write('jsonapi', definition('json-api.yml'));
  write('private-site', definition('private-tracker.yml'));
  write('weird', definition('unsupported-filter.yml'));
  writeFileSync(join(origin, 'defs', 'README.md'), 'not a definition');
  git('add', '.');
  git('commit', '--quiet', '-m', 'first');

  const requests: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'sources-git-'));
  dirs.push(dir);
  const created = createSourcesService({
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    useGit: true,
    definitionsGitUrl: () => `file://${origin}`,
    fetch: ((input: URL | string | Request) => {
      requests.push(String(input));
      return Promise.resolve(new Response('no network in this test', { status: 500 }));
    }) as typeof fetch,
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  const client = createClient(sources, transport);
  await createClient(management, transport).applyConfig({
    values: {
      SOURCES_DISABLE_VPN_CHECK: 'true',
      CARDIGANN_DEFINITION_SOURCES: 'https://raw.githubusercontent.com/o/r/master/defs',
    },
  });

  const first = await wait(client);
  expect(first).toMatchObject({
    total: 3,
    ready: 3,
    lastError: null,
    lastChange: { added: 3, updated: 0, removed: 0, failed: 0 },
  });
  expect(requests).toEqual([]);
  expect(
    (await client.cardigannDefinitions({ ...all, imdb: true })).entries.map(e => e.id)
  ).toEqual(['jsonapi', 'private-site']);

  // Nothing changed upstream: the fetch finds no new commit tree, nothing is read.
  const unchanged = await wait(client);
  expect(unchanged.lastChange).toEqual(first.lastChange);

  // One edited, one added, one removed.
  write('jsonapi', definition('json-api.yml').replace('name: JSON API', 'name: JSON API v2'));
  write('nested', definition('nested-json.yml'));
  unlinkSync(join(origin, 'defs', 'weird.yml'));
  git('add', '-A');
  git('commit', '--quiet', '-m', 'second');
  const second = await wait(client);
  expect(second.lastChange).toEqual({ added: 1, updated: 1, removed: 1, failed: 0 });
  expect(requests).toEqual([]);
  const { entries } = await client.cardigannDefinitions(all);
  expect(entries.map(e => [e.id, e.name])).toEqual([
    ['jsonapi', 'JSON API v2'],
    ['nested', 'Nested JSON'],
    ['private-site', 'Private Site'],
  ]);
});

const JACKETT = 'https://raw.githubusercontent.com/Jackett/Jackett/master/defs';
const PROWLARR = 'https://raw.githubusercontent.com/Prowlarr/Indexers/master/v11';
/** Two GitHub-hosted sources, each with its own tree and files. */
const twoSources = (
  trees: Record<string, Record<string, { sha: string; yaml: string }>>
): ((url: URL) => Response) => {
  return url => {
    if (url.hostname === 'api.github.com') {
      const owner = url.pathname.split('/')[2];
      const files = trees[owner];
      return files
        ? Response.json({
            sha: `tree-${owner}`,
            tree: Object.entries(files).map(([id, file]) => ({
              path: `${id}.yml`,
              type: 'blob',
              sha: file.sha,
            })),
          })
        : new Response('missing', { status: 404 });
    }
    const [, owner] = url.pathname.split('/');
    const id = url.pathname.split('/').pop()!.replace('.yml', '');
    const file = trees[owner]?.[id];
    return file ? new Response(file.yaml) : new Response('missing', { status: 404 });
  };
};
const sourceKeys = {
  jackett: 'Jackett/Jackett@master:defs',
  prowlarr: 'Prowlarr/Indexers@master:v11',
};

it('offers indexers from several sources, even with the same id, and installs from the chosen one', async () => {
  const handler = twoSources({
    Jackett: { jsonapi: { sha: 'j1', yaml: definition('json-api.yml') } },
    Prowlarr: {
      jsonapi: {
        sha: 'p1',
        yaml: definition('json-api.yml').replace('movie-search: [q, imdbid]', 'movie-search: [q]'),
      },
      nested: { sha: 'p2', yaml: definition('nested-json.yml') },
    },
  });
  const { client, ready } = setup(handler, `${JACKETT} ${PROWLARR}`);
  await ready();
  const sync = await wait(client);
  expect(
    sync.sources.map(source => [source.key, source.label, source.total, source.lastError])
  ).toEqual([
    [sourceKeys.jackett, 'Jackett/Jackett', 1, null],
    [sourceKeys.prowlarr, 'Prowlarr/Indexers', 2, null],
  ]);
  expect(sync.total).toBe(3);

  const everything = await client.cardigannDefinitions(all);
  expect(everything.entries.map(e => [e.id, e.sourceLabel])).toEqual([
    ['jsonapi', 'Jackett/Jackett'],
    ['jsonapi', 'Prowlarr/Indexers'],
    ['nested', 'Prowlarr/Indexers'],
  ]);
  expect(everything.entries.map(e => e.supports.imdb)).toEqual([true, false, true]);
  const fromProwlarr = await client.cardigannDefinitions({ ...all, source: sourceKeys.prowlarr });
  expect(fromProwlarr.entries.map(e => e.id)).toEqual(['jsonapi', 'nested']);
  expect((await client.cardigannDefinitions({ ...all, source: 'nothing' })).total).toBe(0);

  // Installing from one source marks only that copy as installed.
  const view = await client.addCardigannProvider({ id: 'jsonapi', source: sourceKeys.prowlarr });
  expect(view).toMatchObject({ id: 'prowlarr-jsonapi', name: 'JSON API' });
  expect(view.caps.movie).not.toContain('imdbid');
  expect(
    (await client.cardigannDefinitions(all)).entries.map(e => [e.sourceLabel, e.id, e.installed])
  ).toEqual([
    ['Jackett/Jackett', 'jsonapi', false],
    ['Prowlarr/Indexers', 'jsonapi', true],
    ['Prowlarr/Indexers', 'nested', false],
  ]);
  // The same indexer from the other source gets its own provider, named to tell them apart.
  const other = await client.addCardigannProvider({ id: 'jsonapi', source: sourceKeys.jackett });
  expect(other).toMatchObject({ id: 'jackett-jsonapi', name: 'JSON API (Jackett/Jackett)' });
  expect(other.caps.movie).toContain('imdbid');
  // Without a source, the first configured one is used.
  await rejectsWith(client.addCardigannProvider({ id: 'nested' }), 'bad_request');
  await rejectsWith(
    client.addCardigannProvider({ id: 'jsonapi', source: 'not-configured' }),
    'bad_request'
  );
  await rejectsWith(
    client.addCardigannProvider({ id: 'jsonapi', source: sourceKeys.prowlarr }),
    'bad_request'
  );
});

it('follows changes to the list of sources', async () => {
  const handler = twoSources({
    Jackett: { jsonapi: { sha: 'j1', yaml: definition('json-api.yml') } },
    Prowlarr: { nested: { sha: 'p1', yaml: definition('nested-json.yml') } },
  });
  const dir = mkdtempSync(join(tmpdir(), 'sources-list-'));
  dirs.push(dir);
  const created = createSourcesService({
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    fetch: ((input: URL | string | Request) =>
      handler(new URL(String(input)))) as unknown as typeof fetch,
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  const client = createClient(sources, transport);
  const admin = createClient(management, transport);
  const configure = (list: string) =>
    admin.applyConfig({
      values: { SOURCES_DISABLE_VPN_CHECK: 'true', CARDIGANN_DEFINITION_SOURCES: list },
    });

  await configure(`${JACKETT} ${PROWLARR}`);
  expect((await wait(client)).total).toBe(2);
  await client.addCardigannProvider({ id: 'nested', source: sourceKeys.prowlarr });

  // Dropping a source stops offering its indexers, but one already installed keeps working.
  await configure(JACKETT);
  const sync = await wait(client);
  expect(sync.sources.map(source => source.label)).toEqual(['Jackett/Jackett']);
  expect((await client.cardigannDefinitions(all)).entries.map(e => e.id)).toEqual(['jsonapi']);
  expect((await client.providers()).some(p => p.id === 'prowlarr-nested')).toBe(true);

  // An unreachable source is reported on its own and does not hide the others.
  await configure(`${JACKETT} https://raw.githubusercontent.com/Nobody/Nothing/master/x`);
  const mixed = await wait(client);
  expect(mixed.sources.map(source => [source.label, source.lastError === null])).toEqual([
    ['Jackett/Jackett', true],
    ['Nobody/Nothing', false],
  ]);
  expect((await client.cardigannDefinitions(all)).entries.map(e => e.id)).toEqual(['jsonapi']);
});

it('installs and enables preloaded providers at startup, once, and reports the unusable ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-preload-'));
  dirs.push(dir);
  const options = {
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    preloadProviders: `jsonapi@${DEFS} nested@https://example.invalid/defs, nope bad@ @${DEFS} UPPER@${DEFS}`,
  };
  const first = createSourcesService(options);
  stops.push(first.stop);
  const client = createClient(sources, localTransport(first.service));
  await createClient(management, localTransport(first.service)).applyConfig({
    values: { SOURCES_DISABLE_VPN_CHECK: 'true' },
  });
  const providers = await client.providers();
  expect(
    providers.filter(p => p.repositoryId === 'local:user').map(p => [p.id, p.enabled, p.priority])
  ).toEqual([
    ['jackett-jsonapi', true, 10],
    ['example-invalid-nested', true, 20],
  ]);
  await first.stop();
  stops.pop();
  // A restart keeps what the admin changed rather than resetting it.
  const db = new Database(join(dir, 'sources.sqlite'));
  db.run("UPDATE providers SET enabled=0 WHERE id='jackett-jsonapi'");
  db.close();
  const second = createSourcesService(options);
  stops.push(second.stop);
  await createClient(management, localTransport(second.service)).applyConfig({
    values: { SOURCES_DISABLE_VPN_CHECK: 'true' },
  });
  const again = await createClient(sources, localTransport(second.service)).providers();
  expect(again.find(p => p.id === 'jackett-jsonapi')?.enabled).toBe(false);
  expect(again.filter(p => p.repositoryId === 'local:user')).toHaveLength(2);
});

it('reads stored indexers again when the way they are read changes, without downloading them', async () => {
  const fake = github(baseFiles());
  const { client, ready, db } = setup(fake.handler, DEFS);
  await ready();
  await wait(client);
  const imdb = () => db.query("SELECT imdb FROM cardigann_index WHERE id='private-site'").get();
  expect(imdb()).toEqual({ imdb: 1 });
  // Rows as an earlier version stored them: nothing known about what a private tracker can do.
  db.run("UPDATE cardigann_index SET imdb=0, movies=0 WHERE id='private-site'");
  db.run("DELETE FROM cardigann_sync WHERE key='analysis_version'");
  fake.downloaded.length = 0;
  await wait(client);
  expect(imdb()).toEqual({ imdb: 1 });
  expect(fake.downloaded).toEqual([]);
  const entry = (await client.cardigannDefinitions({ ...all, query: 'private' })).entries[0];
  expect(entry).toMatchObject({ supported: false, supports: { imdb: true, movies: true } });
});

it('discovers fixture sources for movies 550 and 120 through the E2E provider configuration', async () => {
  const e2e = join(import.meta.dir, '../../../backend-e2e/docker');
  const compose = parse(readFileSync(join(e2e, 'docker-compose.test.yml'), 'utf8')) as {
    services: Record<string, { environment: string[]; volumes: string[] }>;
  };
  const environment = (service: string) =>
    Object.fromEntries(
      compose.services[service].environment.map(value => {
        const at = value.indexOf('=');
        return [value.slice(0, at), value.slice(at + 1)];
      })
    );
  const backend = environment('backend');
  const service = environment('miauflix-services');
  const definitionsHost = new URL(backend.CARDIGANN_DEFINITION_SOURCES).host;
  const moviesDefinition = parse(
    readFileSync(join(e2e, 'indexer/definitions/movies-api.yml'), 'utf8')
  ) as { links: string[] };
  const moviesHost = new URL(moviesDefinition.links[0]).host;
  const dataMount = compose.services[moviesHost].volumes.find(volume =>
    /:\/app\/data(?::ro)?$/.test(volume)
  );
  if (!dataMount) throw new Error('The movie mock must mount its checked-in data');
  const dataDir = resolve(e2e, dataMount.split(':')[0]);
  const dir = mkdtempSync(join(tmpdir(), 'sources-e2e-fixtures-'));
  dirs.push(dir);
  const calls: string[] = [];
  const created = createSourcesService({
    dataDir: dir,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    preloadProviders: service.SOURCES_PRELOAD_PROVIDERS,
    fetch: (async (input: URL | string | Request) => {
      const url = new URL(String(input));
      calls.push(url.href);
      if (url.host === definitionsHost && url.pathname.startsWith('/definitions/')) {
        const file = url.pathname.slice('/definitions/'.length);
        if (!['movies-api.yml', 'imdb-title.yml'].includes(file))
          throw new Error(`Unexpected definition ${url}`);
        return new Response(readFileSync(join(e2e, 'indexer/definitions', file), 'utf8'));
      }
      if (url.pathname.startsWith('/imdb-detail/'))
        return new Response('No fixture', { status: 404 });
      if (url.host === moviesHost && url.pathname === '/api/v2/list_movies.json') {
        const imdb = url.searchParams.get('query_term');
        if (!['tt0137523', 'tt0120737'].includes(imdb ?? ''))
          throw new Error(`Unexpected movie ${url}`);
        const recording = JSON.parse(
          readFileSync(
            join(dataDir, 'api/v2', `list_movies.json-limit-20-page-1-query_term-${imdb}.json`),
            'utf8'
          )
        ) as { data: unknown };
        return Response.json(recording.data);
      }
      throw new Error(`Unexpected E2E source request ${url}`);
    }) as typeof fetch,
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  await createClient(management, transport).applyConfig({
    values: {
      SOURCES_DISABLE_VPN_CHECK: backend.SOURCES_DISABLE_VPN_CHECK,
      CARDIGANN_DEFINITION_SOURCES: backend.CARDIGANN_DEFINITION_SOURCES,
    },
  });
  const client = createClient(sources, transport);
  for (const [tmdbId, imdbId] of [
    [550, 'tt0137523'],
    [120, 'tt0120737'],
  ] as const) {
    const candidates = [];
    const start = performance.now();
    for await (const item of client.search({
      media: { kind: 'movie', tmdbId, imdbId, title: 'Fixture movie' },
      purpose: 'interactive',
    }))
      if (item.type === 'candidate') candidates.push(item.candidate);
    expect(candidates.length).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(1000);
  }
  expect(calls.some(url => url.includes('/definitions/movies-api.yml'))).toBe(true);
});

it.each([{ invalid: [] }, { invalid: ['missing-at', `UPPER@${DEFS}`, 'bad@not-a-url'] }])(
  'warns only about rejected preload entries (%j)',
  ({ invalid }) => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const dir = mkdtempSync(join(tmpdir(), 'sources-preload-warning-'));
      dirs.push(dir);
      const created = createSourcesService({
        dataDir: dir,
        keyFile: join(dir, '.key'),
        encryptionKey: 'test',
        preloadProviders: [`jsonapi@${DEFS}`, ...invalid].join(' '),
        fetch: (async (input: URL | string | Request): Promise<Response> => {
          throw new Error(`Unexpected startup request: ${String(input)}`);
        }) as typeof fetch,
      });
      stops.push(created.stop);
      if (invalid.length)
        expect(warn).toHaveBeenCalledWith(
          `Sources: ignored SOURCES_PRELOAD_PROVIDERS entries: ${invalid.join(', ')}`
        );
      else expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  }
);

it.each([true, false])(
  'keeps an admin-added provider removable after its definition becomes unsupported (enabled: %s)',
  async enabled => {
    const files = { jsonapi: { sha: 'v1', yaml: definition('json-api.yml') } };
    const tree = { value: 't1' };
    const fake = github(files, tree);
    const { client, ready } = setup(fake.handler, DEFS);
    await ready();
    await wait(client);
    const added = await client.addCardigannProvider({ id: 'jsonapi' });
    if (enabled) await client.updateProvider({ id: added.id, enabled: true });
    files.jsonapi = { sha: 'v2', yaml: definition('private-tracker.yml') };
    tree.value = 't2';
    await wait(client);
    const rows = await client.providers();
    expect(rows.find(row => row.id === added.id)).toMatchObject({
      repositoryId: 'local:user',
      enabled,
      health: {
        state: enabled ? 'degraded' : 'disabled',
        lastError: expect.stringMatching(/private|login|account/i),
      },
    });
    await rejectsWith(client.removeRepository({ id: 'local:user' }), 'bad_request');
    await client.removeProvider({ id: added.id });
    expect((await client.providers()).some(row => row.id === added.id)).toBe(false);
    await client.removeRepository({ id: 'local:user' });
  }
);
