import type { Torrent } from 'webtorrent';

import { ClaimSelection } from '../../../src/engine/download/claim-selection';
import { PlaybackBandwidth } from '../../../src/engine/download/playback-bandwidth';
import { PlaybackState } from '../../../src/engine/download/playback-state';
import type { TorrentAttacher } from '../../../src/engine/download/torrent-attacher';
import type { StorageService } from '../../../src/storage/storage.service';
import { type AnyMock, testConfig } from '../../helpers/engine';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => (resolve = done));
  return { promise, resolve };
};

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const fakeTorrent = () =>
  ({
    path: '/downloads/a',
    pieceLength: 4,
    pieces: new Array(4),
    destroyed: false,
    files: [{ path: 'a.mkv', offset: 0, length: 16, select: jest.fn(), deselect: jest.fn() }],
    select: jest.fn(),
    deselect: jest.fn(),
    setPriority: jest.fn(),
    throttleDownloadSpeed: jest.fn(),
  }) as unknown as Torrent & { files: Array<{ select: AnyMock }> };

describe('ClaimSelection', () => {
  const setup = () => {
    const torrent = fakeTorrent();
    const storageService = {
      getStorageBySource: jest.fn(async () => ({ location: torrent.path })),
      getLiveClaims: jest.fn(async () => [] as unknown[]),
    };
    const changed = jest.fn();
    const selection = new ClaimSelection(
      storageService as unknown as StorageService,
      { torrentAt: () => torrent } as unknown as TorrentAttacher,
      changed
    );
    return { selection, storageService, torrent, changed };
  };

  it('applies one source’s selection changes in order', async () => {
    const { selection, storageService } = setup();
    const first = deferred();
    const order: string[] = [];
    storageService.getLiveClaims
      .mockImplementationOnce(async () => {
        order.push('first started');
        await first.promise;
        order.push('first done');
        return [];
      })
      .mockImplementationOnce(async () => {
        order.push('second started');
        return [];
      });

    const firstPass = selection.reconcileSelection(1);
    const secondPass = selection.reconcileSelection(1);
    await flush();
    expect(order).toEqual(['first started']);

    first.resolve();
    await Promise.all([firstPass, secondPass]);
    expect(order).toEqual(['first started', 'first done', 'second started']);
  });

  it('keeps going after a failed pass and reports every pass, failed or not', async () => {
    const { selection, storageService, changed } = setup();
    storageService.getLiveClaims.mockRejectedValueOnce(new Error('db down'));

    await expect(selection.reconcileSelection(1)).rejects.toThrow('db down');
    await expect(selection.reconcileSelection(1)).resolves.toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('holds a paused source empty until it is resumed', async () => {
    const { selection, storageService, torrent } = setup();
    storageService.getLiveClaims.mockResolvedValue([
      { path: 'a.mkv', kind: 'watched', rangeStart: 0, rangeEnd: null },
    ]);

    await expect(selection.pauseDownload(1)).resolves.toBe(true);
    await selection.reconcileSelection(1);
    expect(torrent.files[0].select).not.toHaveBeenCalled();

    await expect(selection.resumeDownload(1)).resolves.toBe(true);
    expect(torrent.files[0].select).toHaveBeenCalledTimes(1);
  });
});

describe('PlaybackBandwidth', () => {
  const setup = () => {
    const torrent = fakeTorrent();
    const storageService = {
      getLiveClaims: jest.fn(async () => [] as unknown[]),
      getStorageBySource: jest.fn(),
      getSpeculativeSourceIds: jest.fn(async () => [] as number[]),
    };
    const playback = new PlaybackState();
    const selection = { pauseDownload: jest.fn(), resumeDownload: jest.fn() };
    const bandwidth = new PlaybackBandwidth(
      storageService as unknown as StorageService,
      testConfig(),
      { client: { torrents: [torrent] }, torrentAt: () => torrent } as unknown as TorrentAttacher,
      playback,
      selection as unknown as ClaimSelection,
      () => new Set([1])
    );
    return { bandwidth, storageService, torrent, playback, selection };
  };

  it('coalesces refreshes requested during a pass into one more pass', async () => {
    const { bandwidth, storageService } = setup();
    const gate = deferred();
    storageService.getLiveClaims.mockImplementationOnce(async () => {
      await gate.promise;
      return [];
    });

    bandwidth.refreshTorrentPriorities();
    bandwidth.refreshTorrentPriorities();
    bandwidth.refreshTorrentPriorities();
    gate.resolve();
    await flush();

    expect(storageService.getLiveClaims).toHaveBeenCalledTimes(2);
  });

  it('sets a torrent’s priority and cap only when they change', async () => {
    const { bandwidth, torrent, playback, storageService } = setup();
    bandwidth.refreshTorrentPriorities();
    await flush();
    bandwidth.refreshTorrentPriorities();
    await flush();
    expect(torrent.setPriority).toHaveBeenCalledTimes(1);
    // Uncapped is WebTorrent's default, so nothing is throttled yet.
    expect(torrent.throttleDownloadSpeed).not.toHaveBeenCalled();

    // Another source's stream is buffering (no layout yet): this torrent is capped, once.
    playback.openStream(5, 'movie.mkv');
    storageService.getStorageBySource.mockResolvedValue({ location: '/other' });
    bandwidth.refreshTorrentPriorities();
    await flush();
    bandwidth.refreshTorrentPriorities();
    await flush();
    expect(torrent.throttleDownloadSpeed).toHaveBeenCalledTimes(1);
    expect(torrent.setPriority).toHaveBeenCalledTimes(1);
  });

  it('resumes only the sources it paused for playback', async () => {
    const { bandwidth, storageService, playback, selection } = setup();
    playback.openStream(9, 'movie.mkv');
    // The stream's source has no layout yet, so it is still buffering.
    storageService.getStorageBySource.mockResolvedValue({ location: '/other' });
    storageService.getSpeculativeSourceIds.mockResolvedValue([2, 3, 9]);
    selection.pauseDownload.mockImplementation(async (id: number) => id === 2);

    await bandwidth.pauseSpeculativeDownloads(9);
    expect(selection.pauseDownload.mock.calls).toEqual([[2], [3]]);

    await bandwidth.resumeSpeculativeDownloads();
    expect(selection.resumeDownload.mock.calls).toEqual([[2]]);
  });

  it('resumes a source at once when its stream ends while the pause is pending', async () => {
    const { bandwidth, storageService, playback, selection } = setup();
    playback.openStream(9, 'movie.mkv');
    storageService.getStorageBySource.mockResolvedValue({ location: '/other' });
    storageService.getSpeculativeSourceIds.mockResolvedValue([2]);
    const pause = deferred();
    selection.pauseDownload.mockImplementation(async () => {
      await pause.promise;
      return true;
    });

    const pausing = bandwidth.pauseSpeculativeDownloads(9);
    await flush();
    // The stream ends, and its readiness check finds nothing paused yet.
    playback.closeStream(9, 'movie.mkv');
    await bandwidth.resumeSpeculativeDownloadsWhenPlaybackReady();
    expect(selection.resumeDownload).not.toHaveBeenCalled();

    pause.resolve();
    await pausing;
    expect(selection.resumeDownload.mock.calls).toEqual([[2]]);
  });

  it('keeps a source whose resume failed for the next readiness check', async () => {
    const { bandwidth, storageService, playback, selection } = setup();
    playback.openStream(9, 'movie.mkv');
    storageService.getStorageBySource.mockResolvedValue({ location: '/other' });
    storageService.getSpeculativeSourceIds.mockResolvedValue([2]);
    selection.pauseDownload.mockResolvedValue(true);
    await bandwidth.pauseSpeculativeDownloads(9);

    selection.resumeDownload.mockRejectedValueOnce(new Error('busy'));
    await bandwidth.resumeSpeculativeDownloads();
    await bandwidth.resumeSpeculativeDownloads();
    expect(selection.resumeDownload.mock.calls).toEqual([[2], [2]]);
  });
});
