jest.mock('ws', () => {
  const { EventEmitter } = jest.requireActual('node:events');
  class MockSocket extends EventEmitter {
    static instances: MockSocket[] = [];
    terminate = jest.fn(() => this.emit('close'));
    constructor(readonly url: URL) {
      super();
      MockSocket.instances.push(this);
    }
  }
  return { __esModule: true, default: MockSocket };
});

import type { EventEmitter } from 'node:events';

import { configureFakerSeed } from '@__test-utils__/utils';
import WebSocket from 'ws';

import { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { RemoteServiceManager } from '@services/remote/remote-service.manager';

type MockSocket = EventEmitter & { url: URL; terminate: jest.Mock };
const sockets = (WebSocket as unknown as { instances: MockSocket[] }).instances;
const update = {
  mediaType: 'movie',
  mediaId: 42,
  backdrop: 'backdrop.jpg',
  logo: 'card.png',
  heroLogo: 'hero.png',
  artworkRevision: 1,
  cardLogoStatus: 'ready',
  heroLogoStatus: 'ready',
};
const setupTest = () => {
  const configuration = { getDynamic: jest.fn(() => 'https://catalog.example') };
  const client = new CatalogClientService(configuration as unknown as ConfigurationService);
  const remote = (client as unknown as { remote: RemoteServiceManager }).remote;
  jest.spyOn(remote, 'isReady').mockReturnValue(true);
  jest.spyOn(remote, 'capabilityBasePath', 'get').mockReturnValue('/v1/catalog');
  return { client, remote, configuration };
};

describe('catalog artwork WebSocket', () => {
  beforeAll(() => configureFakerSeed());
  beforeEach(() => {
    jest.useFakeTimers();
    sockets.length = 0;
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses the capability URL and delivers only validated text updates', () => {
    const { client } = setupTest();
    const ready = jest.fn();
    const listener = jest.fn();
    client.onArtworkStreamReady(ready);
    const unsubscribe = client.onArtwork(listener);
    const socket = sockets[0];
    expect(socket.url.href).toBe('wss://catalog.example/v1/catalog/media/artwork/events');
    socket.emit('open');
    expect(ready).toHaveBeenCalledTimes(1);
    socket.emit('message', Buffer.from('invalid'), false);
    socket.emit('message', Buffer.from('{}'), false);
    socket.emit('message', Buffer.from(JSON.stringify(update)), true);
    expect(listener).not.toHaveBeenCalled();
    socket.emit('message', Buffer.from(JSON.stringify(update)), false);
    expect(listener).toHaveBeenCalledWith(update);
    unsubscribe();
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100_000);
    expect(sockets).toHaveLength(1);
  });

  it('reconnects after failure and ignores events from a replaced socket', () => {
    const { client } = setupTest();
    const listener = jest.fn();
    const unsubscribe = client.onArtwork(listener);
    const first = sockets[0];
    first.emit('open');
    first.emit('error', new Error('disconnected'));
    jest.advanceTimersByTime(750);
    expect(sockets).toHaveLength(2);
    const second = sockets[1];
    second.emit('open');
    first.emit('close');
    first.emit('message', Buffer.from(JSON.stringify(update)), false);
    expect(listener).not.toHaveBeenCalled();
    second.emit('message', Buffer.from(JSON.stringify(update)), false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('cancels reconnection on shutdown and skips reconnect while the catalog is unavailable', () => {
    const { client, remote } = setupTest();
    const stop = jest.spyOn(remote, 'stop').mockImplementation(() => undefined);
    client.onArtwork(jest.fn());
    sockets[0].emit('close');
    client.stop();
    jest.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);
    expect(stop).toHaveBeenCalledTimes(1);

    const next = setupTest();
    const unsubscribe = next.client.onArtwork(jest.fn());
    jest.spyOn(next.remote, 'isReady').mockReturnValue(false);
    sockets[1].emit('close');
    jest.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    unsubscribe();
  });

  it('terminates a silent connection but keeps one receiving pings alive', () => {
    const { client } = setupTest();
    const unsubscribe = client.onArtwork(jest.fn());
    const socket = sockets[0];
    socket.emit('open');
    jest.advanceTimersByTime(60_000);
    socket.emit('ping');
    jest.advanceTimersByTime(60_000);
    expect(socket.terminate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30_000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    unsubscribe();
    jest.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);
  });
});
