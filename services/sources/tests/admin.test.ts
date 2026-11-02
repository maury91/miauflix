import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, isContractError, localTransport, management } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { createSourcesService } from '../src/service';
import { fixtureFetch, fixtureResolver } from './http-fixture';

const dirs: string[] = [];
const stops: Array<() => Promise<void>> = [];
const manifest = (version: string, extra: object[] = []) => [
  {
    id: 'mytorznab',
    name: 'My Torznab',
    version,
    kind: 'torznab',
    baseUrl: 'https://indexer.invalid/api',
    defaults: { enabled: false, priority: 50 },
    settings: { apiKey: 'default-key', note: version },
  },
  ...extra,
];
const setup = (handler: (url: URL) => Response | Promise<Response>) => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-admin-'));
  dirs.push(dir);
  const created = createSourcesService({
    dataDir: dir,
    resolveHost: fixtureResolver,
    keyFile: join(dir, '.key'),
    encryptionKey: 'test',
    fetch: fixtureFetch(url => handler(url)),
  });
  stops.push(created.stop);
  const transport = localTransport(created.service);
  const admin = createClient(management, transport);
  return {
    client: createClient(sources, transport),
    admin,
    db: new Database(join(dir, 'sources.sqlite')),
    ready: () =>
      admin.applyConfig({
        values: { SOURCES_DISABLE_VPN_CHECK: 'true', SOURCES_HEDGE_MS: '10' },
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
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('lists the built-in providers in priority order', async () => {
  const { client, ready } = setup(() => json({}));
  await ready();
  const providers = await client.providers();
  expect(providers.map(p => [p.id, p.priority, p.repositoryId])).toEqual([
    ['therarbg', 10, 'builtin:miauflix'],
    ['yts', 20, 'builtin:miauflix'],
    ['eztv', 30, 'builtin:miauflix'],
  ]);
  expect(providers[0].caps.movie).toContain('imdbid');
  expect((await client.repositories()).map(r => [r.id, r.builtIn, r.providerCount])).toEqual([
    ['builtin:miauflix', true, 3],
  ]);
});

it('adds a repository from a manifest and inserts its providers', async () => {
  const { client, ready } = setup(() => json(manifest('1.0.0')));
  await ready();
  const repo = await client.addRepository({ url: 'https://repo.invalid/providers.json' });
  expect(repo).toMatchObject({ builtIn: false, providerCount: 1, lastError: null });
  const added = (await client.providers()).find(p => p.id === 'mytorznab')!;
  expect(added).toMatchObject({
    enabled: false,
    priority: 50,
    kind: 'torznab',
    repositoryId: repo.id,
  });
  await rejectsWith(
    client.addRepository({ url: 'https://repo.invalid/providers.json' }),
    'bad_request'
  );
});

it('rejects invalid manifests and unreachable repositories', async () => {
  const bad = setup(() => json([{ id: 'x', name: 'x' }]));
  await bad.ready();
  await rejectsWith(bad.client.addRepository({ url: 'https://repo.invalid/a' }), 'bad_request');
  await rejectsWith(bad.client.addRepository({ url: 'file:///etc/passwd' }), 'bad_request');
  const down = setup(() => new Response('nope', { status: 500 }));
  await down.ready();
  await rejectsWith(down.client.addRepository({ url: 'https://repo.invalid/a' }), 'bad_request');
  expect(await down.client.repositories()).toHaveLength(1);
});

it('does not overwrite a provider owned by another repository', async () => {
  const { client, ready } = setup(() =>
    json(
      manifest('1.0.0', [
        { id: 'yts', name: 'Evil YTS', version: '9', kind: 'native', native: 'yts' },
      ])
    )
  );
  await ready();
  const repo = await client.addRepository({ url: 'https://repo.invalid/a' });
  expect(repo.lastError).toContain('yts');
  const yts = (await client.providers()).find(p => p.id === 'yts')!;
  expect(yts).toMatchObject({ name: 'YTS', repositoryId: 'builtin:miauflix' });
});

it('refresh updates the definition but keeps enabled, priority and settings', async () => {
  let version = '1.0.0';
  const { client, ready } = setup(() => json(manifest(version)));
  await ready();
  const repo = await client.addRepository({ url: 'https://repo.invalid/a' });
  await client.updateProvider({
    id: 'mytorznab',
    enabled: true,
    priority: 5,
    settings: { note: 'mine' },
  });
  version = '2.0.0';
  const refreshed = await client.refreshRepository({ id: repo.id });
  expect(refreshed.lastError).toBeNull();
  const provider = (await client.providers()).find(p => p.id === 'mytorznab')!;
  expect(provider).toMatchObject({ version: '2.0.0', enabled: true, priority: 5 });
  expect(provider.settings).toMatchObject({ note: 'mine', apiKey: '••••' });
});

it('removes repositories with their providers but never the built-in one', async () => {
  const { client, ready } = setup(() => json(manifest('1.0.0')));
  await ready();
  const repo = await client.addRepository({ url: 'https://repo.invalid/a' });
  await client.removeRepository({ id: repo.id });
  expect((await client.providers()).some(p => p.id === 'mytorznab')).toBe(false);
  await rejectsWith(client.removeRepository({ id: 'builtin:miauflix' }), 'bad_request');
  await rejectsWith(client.removeRepository({ id: 'repo:missing' }), 'not_found');
});

it('masks password settings and stores them sealed', async () => {
  const { client, ready, db } = setup(() => json(manifest('1.0.0')));
  await ready();
  await client.addRepository({ url: 'https://repo.invalid/a' });
  const first = await client.updateProvider({
    id: 'mytorznab',
    settings: { apiKey: 'super-secret' },
  });
  expect(first.settings.apiKey).toBe('••••');
  const second = await client.updateProvider({ id: 'mytorznab', settings: { apiKey: '••••' } });
  expect(second.settings.apiKey).toBe('••••');
  const raw = db.query("SELECT settings FROM providers WHERE id='mytorznab'").get() as {
    settings: string;
  };
  expect(raw.settings).not.toContain('super-secret');
});

it('validates provider updates', async () => {
  const { client, ready } = setup(() => json({}));
  await ready();
  await rejectsWith(client.updateProvider({ id: 'nope', enabled: true }), 'not_found');
  await rejectsWith(client.updateProvider({ id: 'yts', priority: 0 }), 'bad_request');
  await rejectsWith(
    client.updateProvider({ id: 'yts', settings: { unknown: 'x' } }),
    'bad_request'
  );
  await rejectsWith(
    client.updateProvider({ id: 'yts', settings: { dailyBudget: '-3' } }),
    'bad_request'
  );
  const view = await client.updateProvider({ id: 'yts', settings: { dailyBudget: '50' } });
  expect(view.usage.dailyBudget).toBe(50);
  expect(
    (await client.updateProvider({ id: 'yts', settings: { dailyBudget: '' } })).usage.dailyBudget
  ).toBe(2000);
});

it('reorders providers and the planner follows the new order', async () => {
  const calls: string[] = [];
  const { client, ready } = setup(url => {
    calls.push(url.host);
    return json({ status: 'ok', data: { movie_count: 0, movies: [] } });
  });
  await ready();
  const ordered = await client.reorderProviders({ ids: ['yts', 'therarbg'] });
  expect(ordered.map(p => [p.id, p.priority])).toEqual([
    ['yts', 10],
    ['therarbg', 20],
    ['eztv', 30],
  ]);
  await rejectsWith(client.reorderProviders({ ids: ['yts', 'yts'] }), 'bad_request');
  await rejectsWith(client.reorderProviders({ ids: ['ghost'] }), 'bad_request');
  for await (const _ of client.search({
    media: { kind: 'movie', tmdbId: 1, imdbId: 'tt0000001', title: 'Nothing', year: 2000 },
    purpose: 'background',
  }));
  expect(calls[0]).not.toContain('rarbg');
  expect(calls.some(host => host.includes('rarbg'))).toBe(true);
});

it('emits providersChanged and tests providers', async () => {
  const { client, ready } = setup(() => json({}));
  await ready();
  const seen: string[] = [];
  const stop = client.providersChanged.on((change: { at: string }) => seen.push(change.at));
  await client.updateProvider({ id: 'eztv', enabled: false });
  expect(seen).toHaveLength(1);
  stop?.();
  await rejectsWith(client.testProvider({ id: 'ghost' }), 'not_found');
  expect(typeof (await client.testProvider({ id: 'eztv' })).success).toBe('boolean');
});
