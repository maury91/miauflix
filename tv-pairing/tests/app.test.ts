import { describe, expect, it } from 'bun:test';

import {
  type AnnouncedServer,
  createDiscoveryApp,
  networkKey,
  normalizeServerUrl,
} from '../src/app';

const HOME = '203.0.113.1';
const NEIGHBOUR = '198.51.100.7';

const setupTest = (options: Parameters<typeof createDiscoveryApp>[0] = {}) => {
  let time = 1_000_000;
  const app = createDiscoveryApp({ now: () => time, ...options });
  const post = (body: unknown, ip = HOME) =>
    app.fetch(
      new Request('https://pair.test/v1/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      ip
    );
  const announce = (body: Record<string, unknown>, ip?: string) =>
    post({ role: 'server', id: 'server-one', urls: ['http://192.168.1.10:3000'], ...body }, ip);
  const lookup = async (ip?: string) =>
    ((await (await post({ role: 'client' }, ip)).json()) as { servers: AnnouncedServer[] }).servers;
  return {
    app,
    post,
    announce,
    lookup,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

describe('tv discovery', () => {
  it('gives a TV the servers announced from its public IP', async () => {
    const { announce, lookup } = setupTest();

    const response = await announce({ name: 'Home', urls: ['http://192.168.1.10:3000/'] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ announceInterval: 120 });

    expect(await lookup()).toEqual([
      {
        id: 'server-one',
        name: 'Home',
        urls: ['http://192.168.1.10:3000'],
        lastSeen: new Date(1_000_000).toISOString(),
      },
    ]);
    expect(await lookup(NEIGHBOUR)).toEqual([]);
  });

  it('forgets a server that stops announcing', async () => {
    const { announce, lookup, advance, app } = setupTest();
    await announce({});

    advance(4 * 60_000);
    await announce({});
    advance(4 * 60_000);
    expect(await lookup()).toHaveLength(1);

    advance(60_000);
    expect(await lookup()).toEqual([]);
    expect(app.networks).toBe(0);
  });

  it('replaces a server announcement and lists the latest first', async () => {
    const { announce, lookup, advance } = setupTest();
    await announce({ id: 'server-one' });
    advance(1000);
    await announce({ id: 'server-two' });
    advance(1000);
    await announce({ id: 'server-one', urls: ['http://192.168.1.11:3000'] });

    const servers = await lookup();
    expect(servers.map(server => server.id)).toEqual(['server-one', 'server-two']);
    expect(servers[0]).toMatchObject({ urls: ['http://192.168.1.11:3000'] });
  });

  it('keeps a bounded number of servers per network', async () => {
    const { announce, lookup } = setupTest({ maxServersPerNetwork: 2 });
    await announce({ id: 'server-one' });
    await announce({ id: 'server-two' });
    await announce({ id: 'server-three' });

    expect((await lookup()).map(server => server.id)).toEqual(['server-three', 'server-two']);
  });

  it('matches IPv6 clients by their /64', async () => {
    const { announce, lookup } = setupTest();
    await announce({}, '2001:db8:1:2::10');

    expect(await lookup('2001:0db8:0001:0002:aaaa::1')).toHaveLength(1);
    expect(await lookup('2001:db8:1:3::10')).toEqual([]);
  });

  it('rejects malformed announcements', async () => {
    const { announce, post } = setupTest();

    expect((await announce({ id: 'short' })).status).toBe(400);
    expect((await announce({ urls: [] })).status).toBe(400);
    expect((await announce({ urls: ['http://x.example/path'] })).status).toBe(400);
    expect((await announce({ urls: ['ftp://x.example'] })).status).toBe(400);
    expect((await post({ role: 'admin' })).status).toBe(400);
  });

  it('rate limits each network', async () => {
    const { lookup, post } = setupTest({ requestsPerMinute: 2 });
    await lookup();
    await lookup();

    expect((await post({ role: 'client' })).status).toBe(429);
    expect((await post({ role: 'client' }, NEIGHBOUR)).status).toBe(200);
  });

  it('caps the networks it keeps', async () => {
    const { announce } = setupTest({ maxNetworks: 1 });
    await announce({});

    expect((await announce({}, NEIGHBOUR)).status).toBe(503);
  });

  it('allows any origin without credentials', async () => {
    const { app } = setupTest();
    const response = await app.fetch(
      new Request('https://pair.test/v1/discovery', { method: 'OPTIONS' }),
      HOME
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('networkKey', () => {
  it('keeps IPv4 addresses and the /64 of IPv6 ones', () => {
    expect(networkKey('203.0.113.1')).toBe('203.0.113.1');
    expect(networkKey('::ffff:203.0.113.1')).toBe('203.0.113.1');
    expect(networkKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(networkKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
});

describe('normalizeServerUrl', () => {
  it('keeps the origin', () => {
    expect(normalizeServerUrl('http://192.168.1.10:3000/')).toBe('http://192.168.1.10:3000');
    expect(normalizeServerUrl('http://u:p@x.example')).toBeNull();
  });
});
