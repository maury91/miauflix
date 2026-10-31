import { describe, expect, it } from 'bun:test';

import { createPairingApp, normalizeCode, normalizeServerUrl } from '../src/app';

const BASE = 'https://pair.test';

const setupTest = (options: Parameters<typeof createPairingApp>[0] = {}) => {
  let time = 1_000_000;
  const app = createPairingApp({ now: () => time, ...options });
  const call = (method: string, path: string, init: RequestInit = {}, ip = '203.0.113.1') =>
    app.fetch(new Request(`${BASE}${path}`, { method, ...init }), ip);
  const createPairing = async () => {
    const response = await call('POST', '/v1/pairings');
    return (await response.json()) as {
      code: string;
      secret: string;
      expiresAt: string;
      pollInterval: number;
    };
  };
  const complete = (code: string, body: unknown, ip?: string) =>
    call(
      'PUT',
      `/v1/pairings/${code}`,
      { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
      ip
    );
  const poll = (code: string, secret: string) =>
    call('GET', `/v1/pairings/${code}`, { headers: { Authorization: `Bearer ${secret}` } });
  return {
    app,
    call,
    createPairing,
    complete,
    poll,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

describe('tv pairing', () => {
  it('hands the address a server stored to the TV once', async () => {
    const { createPairing, complete, poll, app } = setupTest();
    const { code, secret, pollInterval } = await createPairing();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(pollInterval).toBe(3);

    const pending = await poll(code, secret);
    expect(pending.status).toBe(202);

    const completed = await complete(code, { url: 'http://192.168.1.10:3000/', name: 'Home' });
    expect(completed.status).toBe(204);

    const paired = await poll(code, secret);
    expect(paired.status).toBe(200);
    expect(await paired.json()).toEqual({
      status: 'paired',
      server: { url: 'http://192.168.1.10:3000', name: 'Home' },
    });
    expect(app.size).toBe(0);
    expect((await poll(code, secret)).status).toBe(404);
  });

  it('accepts the code as people type it', async () => {
    const { createPairing, complete } = setupTest();
    const { code } = await createPairing();
    const typed = `${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`;

    expect((await complete(encodeURIComponent(typed), { url: 'https://m.example' })).status).toBe(
      204
    );
  });

  it('answers a wrong secret like an unknown code', async () => {
    const { createPairing, poll } = setupTest();
    const { code } = await createPairing();

    const response = await poll(code, 'wrong');
    expect(response.status).toBe(404);
  });

  it('refuses a second address for the same code', async () => {
    const { createPairing, complete } = setupTest();
    const { code } = await createPairing();
    await complete(code, { url: 'http://192.168.1.10:3000' });

    expect((await complete(code, { url: 'http://evil.example' })).status).toBe(409);
  });

  it('expires codes', async () => {
    const { createPairing, complete, advance } = setupTest({ ttlMs: 60_000 });
    const { code } = await createPairing();
    advance(60_000);

    expect((await complete(code, { url: 'http://192.168.1.10:3000' })).status).toBe(404);
  });

  it('rejects addresses that are not plain http(s) origins', async () => {
    const { createPairing, complete } = setupTest();
    const { code } = await createPairing();

    for (const url of ['ftp://x.example', 'http://u:p@x.example', 'http://x.example/path', 7]) {
      expect((await complete(code, { url })).status).toBe(400);
    }
  });

  it('limits code attempts per client', async () => {
    const { complete, advance } = setupTest({ limits: { complete: 2 } });

    expect((await complete('AAAAAAAA', { url: 'http://x.example' })).status).toBe(404);
    expect((await complete('AAAAAAAB', { url: 'http://x.example' })).status).toBe(404);
    expect((await complete('AAAAAAAC', { url: 'http://x.example' })).status).toBe(429);
    expect((await complete('AAAAAAAC', { url: 'http://x.example' }, '198.51.100.7')).status).toBe(
      404
    );
    advance(60_000);
    expect((await complete('AAAAAAAC', { url: 'http://x.example' })).status).toBe(404);
  });

  it('caps open pairings', async () => {
    const { call } = setupTest({ maxPairings: 1 });
    await call('POST', '/v1/pairings');

    expect((await call('POST', '/v1/pairings', {}, '198.51.100.7')).status).toBe(503);
  });

  it('allows any origin without credentials', async () => {
    const { call } = setupTest();
    const response = await call('OPTIONS', '/v1/pairings');

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('rejects ambiguous symbols and wrong lengths', () => {
    expect(normalizeCode('ABCD-EFGH')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCDEFG0')).toBeNull();
    expect(normalizeCode('ABCDEFG')).toBeNull();
  });
});

describe('normalizeServerUrl', () => {
  it('keeps the origin', () => {
    expect(normalizeServerUrl('http://192.168.1.10:3000/')).toBe('http://192.168.1.10:3000');
    expect(normalizeServerUrl('https://miauflix.example')).toBe('https://miauflix.example');
  });
});
