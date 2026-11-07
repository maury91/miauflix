import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, localTransport, management } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { expect, it, spyOn } from 'bun:test';

import { Store } from '../src/db/store';
import { isInternalHost } from '../src/http/destination';
import { type Fetch, HttpClient } from '../src/http/http-client';
import { parseDefinition } from '../src/providers/cardigann/definition';
import { DefinitionIndex } from '../src/providers/cardigann/definition-index';
import { DefinitionStore } from '../src/providers/cardigann/definition-store';
import { CardigannProvider } from '../src/providers/cardigann/engine';
import {
  DEFAULT_SOURCES,
  LEGACY_SOURCE_KEY,
  parseSources,
  PROWLARR_SOURCE_KEY,
} from '../src/providers/cardigann/sources';
import { resolveHashes } from '../src/providers/torrent-hash';
import { TorznabProvider } from '../src/providers/torznab/torznab';
import { createSourcesService } from '../src/service';
import { fixtureFetch, fixtureResolver } from './http-fixture';
import { idTitle, useProviders } from './providers';

const manifest = [
  {
    id: 'external',
    name: 'External',
    version: '1',
    kind: 'torznab',
    baseUrl: 'https://indexer.invalid/api',
    defaults: { enabled: true },
  },
];
const setupTest = async (
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
  now: () => number = Date.now
) => {
  const dir = mkdtempSync(join(tmpdir(), 'sources-review-'));
  const made = createSourcesService({
    dataDir: dir,
    now,
    keyFile: `${dir}/.key`,
    encryptionKey: 'test',
    resolveHost: fixtureResolver,
    fetch: fixtureFetch(handler),
  });
  const transport = localTransport(made.service);
  const client = createClient(sources, transport);
  await createClient(management, transport).applyConfig({
    values: { SOURCES_DISABLE_VPN_CHECK: 'true', SOURCES_HEDGE_MS: '1' },
  });
  const db = new Database(`${dir}/sources.sqlite`);
  db.run('DELETE FROM providers');
  useProviders(
    db,
    ['yts', 'therarbg', 'eztv'].map((id, i) => ({
      id,
      yaml: idTitle(id, `${id}.invalid`),
      priority: i + 1,
    }))
  );
  return {
    ...made,
    client,
    db,
    close: async () => {
      await made.stop();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
};

it('quarantines unreadable settings while preserving other providers and permits explicit recovery', async () => {
  const s = await setupTest(() => Response.json({ torrents: [], torrents_count: 0 }));
  try {
    s.db.run("UPDATE providers SET settings='damaged ciphertext' WHERE id='test-yts'");
    const rows = await s.client.providers();
    expect(rows).toHaveLength(3);
    expect(rows.find(p => p.id === 'test-yts')?.health).toMatchObject({
      state: 'degraded',
      lastError: expect.stringContaining('unreadable'),
    });
    expect(rows.find(p => p.id === 'test-therarbg')?.health.state).toBe('ok');
    const items = [];
    for await (const item of s.client.search({
      media: { kind: 'movie', tmdbId: 1, imdbId: 'tt1234567', title: 'Example' },
      purpose: 'background',
    }))
      items.push(item);
    expect(items.at(-1)?.type).toBe('summary');
    await expect(s.client.updateProvider({ id: 'test-yts', enabled: true })).rejects.toMatchObject({
      code: 'bad_request',
    });
    const repaired = await s.client.updateProvider({
      id: 'test-yts',
      settings: { dailyBudget: '10' },
    });
    expect(repaired.enabled).toBe(false);
    expect(repaired.usage.dailyBudget).toBe(10);
    expect((await s.client.updateProvider({ id: 'test-yts', enabled: true })).enabled).toBe(true);
  } finally {
    await s.close();
  }
});

it('rejects malformed enabled values through the contract without changing provider state', async () => {
  const s = await setupTest(() => Response.json({}));
  try {
    await s.client.updateProvider({ id: 'test-yts', enabled: false });
    for (const enabled of ['false', 0, 1, null, {}]) {
      await expect(
        s.client.updateProvider({ id: 'test-yts', enabled } as never)
      ).rejects.toMatchObject({
        code: 'bad_request',
      });
    }
    expect((await s.client.providers()).find(p => p.id === 'test-yts')?.enabled).toBe(false);
  } finally {
    await s.close();
  }
});

it('refuses internal repository manifests before fetching them', async () => {
  const calls: string[] = [];
  const s = await setupTest(url => {
    calls.push(url.href);
    return Response.json(manifest);
  });
  try {
    await expect(
      s.client.addRepository({ url: 'http://127.0.0.1/manifest' })
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(calls).toEqual([]);
  } finally {
    await s.close();
  }
});

it('does not recreate providers when a repository is removed during refresh', async () => {
  let release!: (r: Response) => void,
    started!: () => void,
    count = 0;
  const waiting = new Promise<void>(r => (started = r));
  const s = await setupTest(() =>
    ++count === 1 ? Response.json(manifest) : (started(), new Promise<Response>(r => (release = r)))
  );
  try {
    const repo = await s.client.addRepository({ url: 'https://repo.invalid/manifest' });
    const refresh = s.client.refreshRepository({ id: repo.id }).catch(e => e);
    await waiting;
    await s.client.removeRepository({ id: repo.id });
    release(Response.json(manifest));
    expect(await refresh).toMatchObject({ code: 'not_found' });
    expect((await s.client.providers()).some(p => p.id === 'external')).toBe(false);
  } finally {
    await s.close();
  }
});

it('settles an aborted refresh before closing the database', async () => {
  let started!: () => void,
    count = 0;
  const waiting = new Promise<void>(r => (started = r));
  const s = await setupTest(() =>
    ++count === 1 ? Response.json(manifest) : (started(), new Promise<Response>(() => {}))
  );
  try {
    const repo = await s.client.addRepository({ url: 'https://repo.invalid/manifest' });
    const refreshing = s.client.refreshRepository({ id: repo.id }).catch(e => e);
    await waiting;
    await s.stop();
    expect(await refreshing).toMatchObject({ code: 'bad_request' });
  } finally {
    await s.close();
  }
});

it('cancels a paused search during shutdown without waiting for its consumer', async () => {
  const s = await setupTest(() => Response.json({ torrents: [], torrents_count: 0 }));
  try {
    s.db.run("UPDATE providers SET enabled=0 WHERE id<>'test-eztv'");
    const stream = s.client.search({
      media: { kind: 'show', tmdbId: 1, imdbId: 'tt1234567', title: 'Example' },
      season: 1,
      episode: 1,
      purpose: 'background',
    });
    await stream[Symbol.asyncIterator]().next();
    await s.stop();
  } finally {
    await s.close();
  }
});

it('blocks private, special-use and IPv4-mapped IPv6 destinations', () => {
  for (const host of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.0.1',
    '172.16.0.1',
    '100.64.0.1',
    '0.0.0.0',
    '[::1]',
    '[fc00::1]',
    '[fe80::1]',
    '[::ffff:127.0.0.1]',
    '[::ffff:7f00:1]',
    'localhost.',
    'host.localhost.',
  ])
    expect(isInternalHost(host)).toBe(true);
  for (const host of ['93.184.216.34', '2606:4700:4700::1111', 'example.com'])
    expect(isInternalHost(host)).toBe(false);
});

it('checks all DNS answers on each redirect and pins public requests with their TLS identity', async () => {
  let calls = 0;
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => '' },
    ((url, init) => {
      calls++;
      expect(String(url)).toBe('https://93.184.216.34/a');
      expect(new Headers(init?.headers).get('host')).toBe('cdn.invalid');
      expect((init as BunFetchRequestInit).tls?.serverName).toBe('cdn.invalid');
      const verify = (init as BunFetchRequestInit).tls?.checkServerIdentity;
      expect(
        verify?.('93.184.216.34', {
          subject: { CN: 'wrong.invalid' },
          subjectaltname: 'DNS:wrong.invalid',
        } as never)
      ).toBeInstanceOf(Error);
      expect(
        verify?.('93.184.216.34', {
          subject: { CN: 'cdn.invalid' },
          subjectaltname: 'DNS:cdn.invalid',
        } as never)
      ).toBeUndefined();
      // @ts-expect-error false is not a valid value for proxy but it is accepted by bun
      expect((init as BunFetchRequestInit).proxy).toBe(false);
      return Promise.resolve(
        new Response(null, { status: 302, headers: { location: 'https://next.invalid/b' } })
      );
    }) as Fetch,
    Date.now,
    async host =>
      host === 'cdn.invalid'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [
            { address: '93.184.216.34', family: 4 },
            { address: '::ffff:127.0.0.1', family: 6 },
          ]
  );
  await expect(http.request('https://cdn.invalid/a', { blockInternal: true })).rejects.toThrow(
    'internal'
  );
  expect(calls).toBe(1);
});

it('keeps guarded GET flights separate from unrestricted callers and checks before charging', async () => {
  let calls = 0,
    charges = 0;
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => '' },
    fixtureFetch(() => {
      calls++;
      return new Response('ok');
    }),
    Date.now,
    async () => [{ address: '127.0.0.1', family: 4 }]
  );
  const open = http.request('http://public-looking.invalid/a');
  await expect(
    http.request('http://public-looking.invalid/a', {
      blockInternal: true,
      beforeRequest: () => {
        charges++;
      },
    })
  ).rejects.toThrow('internal');
  await open;
  expect(calls).toBe(1);
  expect(charges).toBe(0);
});

it('does not delegate guarded DNS or redirects to FlareSolverr', async () => {
  let calls = 0;
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => 'http://solver' },
    fixtureFetch(() => {
      calls++;
      return new Response('Just a moment', { status: 403 });
    }),
    Date.now,
    fixtureResolver
  );
  await expect(http.request('https://provider.invalid/a', { blockInternal: true })).rejects.toThrow(
    'FlareSolverr'
  );
  expect(calls).toBe(1);
});

it('blocks internal hash-only downloads and public redirects to internal destinations', async () => {
  const calls: string[] = [];
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => '' },
    fixtureFetch(url => {
      calls.push(url.href);
      return new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest' },
      });
    }),
    Date.now,
    fixtureResolver
  );
  const results = await resolveHashes(
    [
      { title: 'Internal', torrentUrl: 'http://miauflix-services:3000/admin' },
      { title: 'Metadata', torrentUrl: 'http://169.254.169.254/latest' },
      { title: 'Redirect', torrentUrl: 'https://downloads.invalid/file.torrent' },
    ],
    { signal: new AbortController().signal, http }
  );
  expect(results).toEqual([]);
  expect(calls).toEqual(['https://downloads.invalid/file.torrent']);
});

it('allows hash-only torrent downloads from the configured LAN Torznab host only', async () => {
  const bytes = Buffer.from('d4:infod6:lengthi5e4:name1:xee');
  const calls: string[] = [];
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => '' },
    fixtureFetch(url => {
      calls.push(url.href);
      if (url.pathname === '/api')
        return new Response(
          `<rss><channel><item><title>Movie</title><link>http://jackett:9117/file.torrent</link></item><item><title>Other port</title><link>http://jackett:9999/file.torrent</link></item></channel></rss>`
        );
      return new Response(bytes);
    }),
    Date.now,
    fixtureResolver
  );
  const page = await new TorznabProvider('lan', 'LAN', 'http://jackett:9117/api').search(
    { kind: 'movie', q: 'Movie' },
    { signal: new AbortController().signal, http }
  );
  expect(page.results.map(result => result.title)).toEqual(['Movie']);
  expect(page.results[0].hash).toMatch(/^[a-f0-9]{40}$/);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toBe('http://jackett:9117/file.torrent');
});

it('blocks internal details pages but keeps same-host FlareSolverr details working', async () => {
  const yaml = readFileSync(join(import.meta.dir, 'fixtures/cardigann/html-details.yml'), 'utf8');
  const definition = parseDefinition(yaml);
  definition.settings = [{ name: 'solver', type: 'info_flaresolverr' }];
  const calls: string[] = [];
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => 'http://solver' },
    fixtureFetch((url, init) => {
      calls.push(url.href);
      if (url.host === 'solver') {
        const request = JSON.parse(String(init.body)) as { url: string };
        const body =
          new URL(request.url).pathname === '/find'
            ? '<div class="item"><a class="title" href="http://127.0.0.1/admin">Blocked</a></div><div class="item"><a class="title" href="/details">Allowed</a></div>'
            : '<html><a class="dl" href="magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">Get</a></html>';
        return Response.json({ status: 'ok', solution: { status: 200, response: body } });
      }
      return new Response('challenge', { status: 403 });
    }),
    Date.now,
    fixtureResolver
  );
  const page = await new CardigannProvider('details', 'Details', definition).search(
    { kind: 'movie', q: 'Movie' },
    { signal: new AbortController().signal, http }
  );
  expect(page.results.map(result => result.title)).toEqual(['Allowed']);
  expect(calls).toEqual([
    'https://details.invalid/find?q=Movie',
    'http://solver/v1',
    'https://details.invalid/details',
    'http://solver/v1',
  ]);
});

it('waits for an in-flight definition sync to settle before stop completes', async () => {
  let release!: () => void;
  const done = new Promise<void>(resolve => {
    release = resolve;
  });
  const sync = spyOn(DefinitionIndex.prototype, 'sync').mockImplementation(async () => {
    await done;
    return { added: 0, updated: 0, removed: 0, failed: 0 };
  });
  const s = await setupTest(() => Response.json({}));
  let stopping: Promise<void> | undefined;
  try {
    await s.client.syncCardigannDefinitions();
    expect(sync).toHaveBeenCalledTimes(1);
    let stopped = false;
    stopping = s.stop().then(() => {
      stopped = true;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
  } finally {
    release();
    await stopping;
    sync.mockRestore();
    await s.close();
  }
});

it.each([undefined, 'https://custom.invalid/definitions'])(
  'prepares a manifest Cardigann entry with source %s',
  async source => {
    const calls: string[] = [];
    const s = await setupTest(url => {
      calls.push(url.href);
      return url.host === 'repo.invalid'
        ? Response.json([
            {
              id: 'manifest-indexer',
              name: 'Manifest',
              kind: 'cardigann',
              cardigann: 'sample',
              source,
              version: '1',
            },
          ])
        : new Response(idTitle('sample', 'indexer.invalid'));
    });
    try {
      if (source)
        await createClient(management, localTransport(s.service)).applyConfig({
          values: { SOURCES_DISABLE_VPN_CHECK: 'true', CARDIGANN_DEFINITION_SOURCES: source },
        });
      await s.client.addRepository({ url: 'https://repo.invalid/manifest' });
      const enabled = await s.client.updateProvider({ id: 'manifest-indexer', enabled: true });
      expect(enabled.caps.movie).toContain('imdbid');
      const stored = s.db
        .query<
          { definition: string },
          []
        >("SELECT definition FROM providers WHERE id='manifest-indexer'")
        .get()!;
      expect(JSON.parse(stored.definition).source).toBe(source ?? PROWLARR_SOURCE_KEY);
      expect(calls[1]).toBe(
        source
          ? `${source}/sample.yml`
          : 'https://raw.githubusercontent.com/Prowlarr/Indexers/master/definitions/v11/sample.yml'
      );
    } finally {
      await s.close();
    }
  }
);

it.each([false, true])(
  'prepares a source-less stored row (legacy cache: %s)',
  async cachedLegacy => {
    const calls: string[] = [];
    const s = await setupTest(url => {
      calls.push(url.href);
      return new Response(idTitle('sample', 'indexer.invalid'));
    });
    try {
      s.db
        .query(
          "INSERT INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES ('old-indexer','cardigann','builtin:miauflix','Old',?,0,1)"
        )
        .run(JSON.stringify({ cardigann: 'sample' }));
      if (cachedLegacy)
        s.db
          .query('INSERT INTO cardigann_definitions (source,id,yaml,fetched_at) VALUES (?,?,?,0)')
          .run(LEGACY_SOURCE_KEY, 'sample', idTitle('sample', 'legacy.invalid'));
      expect(
        (await s.client.updateProvider({ id: 'old-indexer', enabled: true })).caps.movie
      ).toContain('imdbid');
      expect(calls).toEqual(
        cachedLegacy
          ? []
          : [
              'https://raw.githubusercontent.com/Prowlarr/Indexers/master/definitions/v11/sample.yml',
            ]
      );
      expect(
        s.db.query("SELECT source FROM cardigann_definitions WHERE id='sample'").get()
      ).toEqual({ source: cachedLegacy ? LEGACY_SOURCE_KEY : PROWLARR_SOURCE_KEY });
    } finally {
      await s.close();
    }
  }
);

it('briefly caches failed definition downloads and retries after the cooldown', async () => {
  let now = Date.now();
  let attempts = 0;
  const s = await setupTest(
    () => {
      attempts++;
      return new Response('unavailable', { status: 503 });
    },
    () => now
  );
  try {
    s.db
      .query(
        "INSERT INTO providers (id,kind,repository_id,name,definition,enabled,priority) VALUES ('missing','cardigann','builtin:miauflix','Missing',?,0,1)"
      )
      .run(JSON.stringify({ cardigann: 'missing', source: PROWLARR_SOURCE_KEY }));
    expect((await s.client.testProvider({ id: 'missing' })).success).toBe(false);
    expect((await s.client.testProvider({ id: 'missing' })).success).toBe(false);
    expect(attempts).toBe(1);
    now += 60_001;
    expect((await s.client.testProvider({ id: 'missing' })).success).toBe(false);
    expect(attempts).toBe(2);
  } finally {
    await s.close();
  }
});

it('reports a newly requested definition sync as running', async () => {
  const s = await setupTest(() => new Promise<Response>(() => {}));
  try {
    expect((await s.client.syncCardigannDefinitions()).syncing).toBe(true);
  } finally {
    await s.close();
  }
});

it.each(['AbortError', 'TimeoutError'])(
  'handles a definition download aborted with %s without repeated stalls',
  async reason => {
    const s = await setupTest(() => Response.json({}));
    let started!: () => void;
    const waiting = new Promise<void>(resolve => {
      started = resolve;
    });
    let calls = 0;
    const http = new HttpClient(
      { timeout: () => 1000, flareSolverr: () => '' },
      fixtureFetch(() => {
        if (++calls === 1) {
          started();
          return new Promise<Response>(() => {});
        }
        return new Response(idTitle('sample', 'indexer.invalid'));
      })
    );
    const definitions = new DefinitionStore(
      new Store(
        s.db,
        value => value,
        value => value
      ),
      http,
      () => parseSources(DEFAULT_SOURCES).sources
    );
    const controller = new AbortController();
    try {
      const first = definitions
        .ensure(PROWLARR_SOURCE_KEY, 'sample', controller.signal)
        .catch(error => error);
      await waiting;
      controller.abort(new DOMException('Definition request stopped', reason));
      expect(await first).toBeInstanceOf(Error);
      const result = await definitions.ensure(
        PROWLARR_SOURCE_KEY,
        'sample',
        new AbortController().signal
      );
      expect(result instanceof Error).toBe(reason === 'TimeoutError');
      expect(calls).toBe(reason === 'TimeoutError' ? 1 : 2);
    } finally {
      controller.abort();
      await s.close();
    }
  }
);
