import { mkdtempSync, rmSync } from 'node:fs';

import { createClient, localTransport, management } from '@miauflix/contract';
import { sources } from '@miauflix/service-contracts';
import { Database } from 'bun:sqlite';
import { expect, it } from 'bun:test';

import { SourcesConfigService } from '../src/config/config.service';
import { isInternalHost } from '../src/http/destination';
import { type Fetch, HttpClient } from '../src/http/http-client';
import { createSourcesService } from '../src/service';
import { VpnGuard } from '../src/vpn/vpn-guard';
import { fixtureFetch, fixtureResolver } from './http-fixture';

const manifest = [
  {
    id: 'external',
    name: 'External',
    version: '1',
    kind: 'native',
    native: 'eztv',
    defaults: { enabled: true },
  },
];
const setupTest = async (
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>
) => {
  const dir = mkdtempSync('/private/tmp/sources-review-');
  const made = createSourcesService({
    dataDir: dir,
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
    s.db.run("UPDATE providers SET settings='damaged ciphertext' WHERE id='yts'");
    const rows = await s.client.providers();
    expect(rows).toHaveLength(3);
    expect(rows.find(p => p.id === 'yts')?.health).toMatchObject({
      state: 'degraded',
      lastError: expect.stringContaining('unreadable'),
    });
    expect(rows.find(p => p.id === 'therarbg')?.health.state).toBe('ok');
    const items = [];
    for await (const item of s.client.search({
      media: { kind: 'movie', tmdbId: 1, imdbId: 'tt1234567', title: 'Example' },
      purpose: 'background',
    }))
      items.push(item);
    expect(items.at(-1)?.type).toBe('summary');
    await expect(s.client.updateProvider({ id: 'yts', enabled: true })).rejects.toMatchObject({
      code: 'bad_request',
    });
    const repaired = await s.client.updateProvider({ id: 'yts', settings: { dailyBudget: '10' } });
    expect(repaired.enabled).toBe(false);
    expect(repaired.usage.dailyBudget).toBe(10);
    expect((await s.client.updateProvider({ id: 'yts', enabled: true })).enabled).toBe(true);
  } finally {
    await s.close();
  }
});

it('rejects malformed enabled values through the contract without changing provider state', async () => {
  const s = await setupTest(() => Response.json({}));
  try {
    await s.client.updateProvider({ id: 'yts', enabled: false });
    for (const enabled of ['false', 0, 1, null, {}]) {
      await expect(s.client.updateProvider({ id: 'yts', enabled } as never)).rejects.toMatchObject({
        code: 'bad_request',
      });
    }
    expect((await s.client.providers()).find(p => p.id === 'yts')?.enabled).toBe(false);
  } finally {
    await s.close();
  }
});

it('preserves valid EZTV rows and normalizes a malformed date to the epoch', async () => {
  const s = await setupTest(() =>
    Response.json({
      torrents_count: 2,
      torrents: [
        {
          title: 'Example S01E01 1080p',
          hash: 'a'.repeat(40),
          seeds: 10,
          season: '1',
          episode: '1',
          date_released_unix: 1,
        },
        {
          title: 'Example S01E01 720p',
          hash: 'b'.repeat(40),
          seeds: 10,
          season: '1',
          episode: '1',
          date_released_unix: 'invalid',
        },
      ],
    })
  );
  try {
    s.db.run("UPDATE providers SET enabled=0 WHERE id<>'eztv'");
    const candidates = [];
    for await (const item of s.client.search({
      media: { kind: 'show', tmdbId: 1, imdbId: 'tt1234567', title: 'Example' },
      season: 1,
      episode: 1,
      purpose: 'background',
    }))
      if (item.type === 'candidate') candidates.push(item.candidate);
    expect(candidates.map(c => c.uploadDate)).toEqual([
      '1970-01-01T00:00:01.000Z',
      '1970-01-01T00:00:00.000Z',
    ]);
  } finally {
    await s.close();
  }
});

it('refuses internal manifests and manifest-configured EZTV endpoints before fetching them', async () => {
  const calls: string[] = [];
  const s = await setupTest(url => {
    calls.push(url.href);
    return Response.json([{ ...manifest[0], settings: { baseUrl: 'http://127.0.0.1:9999' } }]);
  });
  try {
    await expect(
      s.client.addRepository({ url: 'http://127.0.0.1/manifest' })
    ).rejects.toMatchObject({ code: 'bad_request' });
    await s.client.addRepository({ url: 'https://repo.invalid/manifest' });
    expect(await s.client.testProvider({ id: 'external' })).toMatchObject({ success: false });
    expect(calls).toEqual(['https://repo.invalid/manifest']);
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
    s.db.run("UPDATE providers SET enabled=0 WHERE id<>'eztv'");
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

it('does not cache caller cancellation as a failed VPN check', async () => {
  let calls = 0;
  const config = new SourcesConfigService();
  const http = new HttpClient(
    { timeout: () => 1000, flareSolverr: () => '' },
    fixtureFetch(() => {
      calls++;
      return Response.json({ protected: true });
    })
  );
  const vpn = new VpnGuard(config, http);
  const controller = new AbortController();
  controller.abort();
  await expect(vpn.isProtected(controller.signal)).rejects.toBeDefined();
  expect(await vpn.isProtected()).toBe(true);
  expect(calls).toBe(1);
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
      expect((init as BunFetchRequestInit).proxy).toBe('');
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
