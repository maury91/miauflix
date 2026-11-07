import { describe, expect, it } from 'bun:test';
import type { Torrent } from 'webtorrent';

import { TransferStats } from '../../src/engine/transfer-stats';
import { testDatabase } from '../helpers/engine';

type FakeTorrent = { path: string; received: number; uploaded: number; numPeers: number };

const setup = async () => {
  const database = await testDatabase();
  for (const id of [1, 2]) {
    await database.getSourceRepository().put({
      id,
      hash: String(id).repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:' + String(id).repeat(40),
      size: 0,
    });
    await database.getStorageRepository().create({ sourceId: id, location: `/downloads/${id}` });
  }
  const torrents: FakeTorrent[] = [];
  const repository = database.getTransferRepository();
  const stats = new TransferStats({ torrents: torrents as unknown as Torrent[] }, repository, {
    windowSamples: 5,
    retentionMs: 60 * 60 * 1000,
  });
  /** Five ticks a second apart, starting at `start`; returns the window's end. */
  const window = (start: number, each?: () => void) => {
    for (let second = 1; second <= 5; second++) {
      each?.();
      stats.tick(start + second * 1000);
    }
    return start + 5000;
  };
  return { database, repository, stats, torrents, window };
};

describe('TransferStats', () => {
  it('averages speeds and peers over the window and adds bytes to the totals', async () => {
    const { repository, stats, torrents, window } = await setup();
    const torrent = { path: '/downloads/1', received: 0, uploaded: 0, numPeers: 0 };
    torrents.push(torrent);
    // Opening window: the torrent started at 0 bytes.
    (stats as unknown as { windowStart: number }).windowStart = 0;
    let peers = 0;
    const end = window(0, () => {
      torrent.numPeers = ++peers * 2; // 2, 4, 6, 8, 10: average 6
      torrent.received += 1_000_000;
      torrent.uploaded += 100_000;
    });
    expect(stats.liveFor(1)).toEqual({ downloadSpeed: 1_000_000, uploadSpeed: 100_000, peers: 6 });
    expect(repository.history(1)).toEqual([
      { at: end, downloadSpeed: 1_000_000, uploadSpeed: 100_000, peers: 6 },
    ]);

    window(end, () => {
      torrent.received += 500_000;
    });
    expect(stats.states().get(1)).toEqual({
      downloadSpeed: 500_000,
      uploadSpeed: 0,
      peers: 10,
      totalDownloaded: 7_500_000,
      totalUploaded: 500_000,
    });
    expect(repository.history(1, end)).toHaveLength(1);
  });

  it('keeps totals across a re-added torrent whose counters restart', async () => {
    const { stats, torrents, window } = await setup();
    torrents.push({ path: '/downloads/2', received: 4000, uploaded: 0, numPeers: 1 });
    const end = window(0);
    torrents.splice(0, 1, { path: '/downloads/2', received: 1000, uploaded: 0, numPeers: 1 });
    window(end);
    expect(stats.states().get(2)?.totalDownloaded).toBe(5000);
  });

  it('skips idle samples and torrents without storage, and reports unloaded sources as idle', async () => {
    const { repository, stats, torrents, window } = await setup();
    torrents.push({ path: '/downloads/1', received: 0, uploaded: 0, numPeers: 0 });
    torrents.push({ path: '/tmp/metadata-lookup', received: 9000, uploaded: 0, numPeers: 3 });
    window(0);
    expect(repository.history(1)).toEqual([]);
    expect([...stats.states().keys()].sort()).toEqual([1, 2]);
    expect(stats.states().get(2)).toEqual({
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 0,
      totalDownloaded: 0,
      totalUploaded: 0,
    });
  });

  it('prunes samples older than the retention and drops them with their storage', async () => {
    const { database, repository, stats, torrents, window } = await setup();
    const torrent = { path: '/downloads/1', received: 0, uploaded: 0, numPeers: 1 };
    torrents.push(torrent);
    let end = window(0);
    expect(repository.history(1)).toHaveLength(1);
    end = window(end + 2 * 60 * 60 * 1000);
    expect(repository.history(1).map(sample => sample.at)).toEqual([end]);
    await database.getStorageRepository().deleteBySourceId(1);
    expect(repository.history(1)).toEqual([]);
    expect(stats.states().has(1)).toBe(false);
  });
});
