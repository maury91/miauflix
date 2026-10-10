jest.mock('@logger');

import { EventEmitter } from 'node:events';

import { logger } from '@logger';
import type WebTorrent from 'webtorrent';
import type { Torrent } from 'webtorrent';

import { TorrentDiagnostics } from './torrent-diagnostics';

const setupTest = () => {
  const client = Object.assign(new EventEmitter(), { torrents: [] as Torrent[], destroyed: false });
  const diagnostics = new TorrentDiagnostics(client as unknown as WebTorrent, () => ({
    activeScrapes: 2,
  }));
  const addTorrent = (ready = false) => {
    const torrent = Object.assign(new EventEmitter(), {
      ready,
      numPeers: 2,
      downloaded: 100,
      wires: [{ requests: [1, 2], peerRequests: [1] }],
      infoHash: 'private-hash',
      name: 'private-title',
      magnetURI: 'private-magnet',
    }) as unknown as Torrent;
    client.torrents.push(torrent);
    client.emit('add', torrent);
    return torrent;
  };
  return { client, diagnostics, addTorrent };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('observes unresolved magnets immediately, correlates lifecycle IDs, and counts closure once', () => {
  const { client, diagnostics, addTorrent } = setupTest();
  const torrent = addTorrent();
  client.emit('add', torrent);
  torrent.emit('peer', 'private-peer-address');
  torrent.emit('warning', new Error('private-tracker-url'));
  diagnostics.report();
  expect(logger.info).toHaveBeenLastCalledWith(
    'TorrentDiagnostics',
    'Torrent resource snapshot',
    expect.objectContaining({
      added: 1,
      closed: 0,
      torrentCount: 1,
      pendingMetadata: 1,
      activeScrapes: 2,
      peers: 2,
      outgoingRequests: 2,
      incomingRequests: 1,
      processMemoryBytes: expect.objectContaining({
        rss: expect.any(Number),
        heapUsed: expect.any(Number),
        arrayBuffers: expect.any(Number),
      }),
      torrents: [expect.objectContaining({ torrentId: 1, discoveredPeers: 1, warnings: 1 })],
    })
  );
  torrent.emit('close');
  torrent.emit('close');
  client.torrents = [];
  diagnostics.report();
  expect(logger.info).toHaveBeenLastCalledWith(
    'TorrentDiagnostics',
    'Torrent resource snapshot',
    expect.objectContaining({ closed: 1, torrentCount: 0 })
  );
  expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain('private-');
  diagnostics.stop();
});

it('bounds per-torrent output while counting all torrents and prioritizing unresolved magnets', () => {
  const { diagnostics, addTorrent } = setupTest();
  for (let index = 0; index < 25; index += 1) addTorrent(true);
  addTorrent(false);
  diagnostics.report();
  const snapshot = (logger.info as jest.Mock).mock.calls.at(-1)[2];
  expect(snapshot.torrentCount).toBe(26);
  expect(snapshot.peers).toBe(52);
  expect(snapshot.torrents).toHaveLength(20);
  expect(snapshot.omittedTorrents).toBe(6);
  expect(snapshot.torrents[0]).toEqual(expect.objectContaining({ ready: false }));
  diagnostics.stop();
});

it('samples once per minute and stops sampling when the client is destroyed', () => {
  const { client, diagnostics } = setupTest();
  jest.advanceTimersByTime(60_000);
  expect(logger.info).toHaveBeenCalledTimes(1);
  client.destroyed = true;
  jest.advanceTimersByTime(120_000);
  expect(logger.info).toHaveBeenCalledTimes(1);
  expect(client.listenerCount('add')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  diagnostics.stop();
});
