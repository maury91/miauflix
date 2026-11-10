import type { networkInterfaces } from 'os';

import { TvPairingService } from './tv-pairing.service';

const interfaces = (() => ({
  lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  eth0: [
    { family: 'IPv4', address: '192.168.1.10', internal: false },
    { family: 'IPv6', address: 'fe80::1', internal: false },
  ],
  wan: [{ family: 'IPv4', address: '203.0.113.5', internal: false }],
})) as unknown as typeof networkInterfaces;

/** A browser on the same network as the server. */
const LAN_PEER = '192.168.1.30';

const setupTest = (settings: Record<string, unknown> = {}, inContainer = false) => {
  let time = 1_000_000;
  const config: Record<string, unknown> = {
    PORT: 3000,
    TV_PAIRING_ENABLED: true,
    TV_PAIRING_URL: 'https://pair.test/',
    TV_PAIRING_ADDRESSES: undefined,
    ...settings,
  };
  const service = new TvPairingService({ get: (key: string) => config[key] } as never, {
    inContainer,
    interfaces,
    now: () => time,
  });
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ announceInterval: 60 })));
  const sentBody = (call = 0) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body));
  return {
    service,
    fetchMock,
    sentBody,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('TvPairingService', () => {
  it('announces its private addresses, then again when the service asks', async () => {
    const { service, fetchMock, sentBody } = setupTest();

    service.start();
    await jest.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pair.test/v1/discovery',
      expect.objectContaining({ method: 'POST' })
    );
    expect(sentBody()).toEqual({
      role: 'server',
      id: expect.any(String),
      urls: ['http://192.168.1.10:3000'],
    });
    service.stop();
  });

  it('repeats on the interval the service gives', async () => {
    const { service, fetchMock } = setupTest();
    service.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('in a container, announces the private addresses it was reached at', async () => {
    const { service, fetchMock, sentBody } = setupTest({}, true);
    service.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    service.noteHost('miauflix.example.com', LAN_PEER);
    service.noteHost('127.0.0.1:3000', LAN_PEER);
    service.noteHost('192.168.1.20:3000', LAN_PEER);
    await jest.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toMatchObject({ urls: ['http://192.168.1.20:3000'] });
    service.stop();
  });

  it('ignores the Host of requests from outside the network', async () => {
    const { service, fetchMock } = setupTest({}, true);
    service.start();

    service.noteHost('192.168.1.20:3000', '203.0.113.9');
    service.noteHost('192.168.1.21:3000', undefined);
    await jest.advanceTimersByTimeAsync(0);

    expect(service.addresses()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    service.stop();
  });

  it('keeps only the most recent addresses it was reached at', () => {
    const { service, advance } = setupTest({}, true);
    for (let i = 0; i < 40; i++) {
      service.noteHost(`10.0.0.${i}:3000`, '::ffff:10.0.0.99');
      advance(1);
    }
    service.noteHost('10.0.0.0:3000', LAN_PEER);

    const addresses = service.addresses();
    expect(addresses[0]).toBe('http://10.0.0.0:3000');
    expect(addresses.slice(1)).toEqual(
      [39, 38, 37, 36, 35, 34, 33].map(i => `http://10.0.0.${i}:3000`)
    );
    expect((service as unknown as { reachedAt: Map<string, number> }).reachedAt.size).toBe(32);
  });

  it('joins an announcement under way instead of sending another', async () => {
    const { service, fetchMock } = setupTest();
    service.start();
    service.noteHost('192.168.1.20:3000', LAN_PEER);
    await jest.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    service.stop();
  });

  it('forgets addresses it was not reached at for a day', () => {
    const { service, advance } = setupTest({}, true);
    service.noteHost('192.168.1.20:3000', LAN_PEER);

    advance(24 * 60 * 60_000 + 1);
    expect(service.addresses()).toEqual([]);
  });

  it('announces only the configured addresses when set', () => {
    const { service } = setupTest({
      TV_PAIRING_ADDRESSES: ['http://192.168.1.50:8080/', ' '],
    });
    service.noteHost('192.168.1.20:3000', LAN_PEER);

    expect(service.addresses()).toEqual(['http://192.168.1.50:8080']);
  });

  it('detects the addresses when TV_PAIRING_ADDRESSES is unset', () => {
    // The configuration returns '' for an unset variable with a transform, not undefined
    const { service } = setupTest({ TV_PAIRING_ADDRESSES: '' }, true);
    service.noteHost('192.168.1.20:3000', LAN_PEER);

    expect(service.addresses()).toEqual(['http://192.168.1.20:3000']);
  });

  it('sends nothing while turned off', async () => {
    const { service, fetchMock } = setupTest({ TV_PAIRING_ENABLED: false });

    service.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    service.stop();
  });

  it('keeps announcing after the service fails', async () => {
    const { service, fetchMock } = setupTest();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    service.start();
    await jest.advanceTimersByTimeAsync(0);

    await jest.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    service.stop();
  });
});
