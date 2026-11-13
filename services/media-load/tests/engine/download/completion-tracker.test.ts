import { EventEmitter } from 'node:events';

import type { Torrent } from 'webtorrent';

import { CompletionTracker } from '../../../src/engine/download/completion-tracker';
import type { PlaybackBandwidth } from '../../../src/engine/download/playback-bandwidth';
import type { SeedScheduler } from '../../../src/engine/download/seed-scheduler';
import { logger } from '../../../src/lib/logger';
import type { StorageService } from '../../../src/storage/storage.service';
import type { EncryptedStorageLayout } from '../../../src/storage/types';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('CompletionTracker', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists the bitfield on every burst when the lock runs the write before returning', async () => {
    const storageService = {
      // Runs the operation synchronously, before the returned promise is handed back.
      withSourceLock: jest.fn((_id: number, operation: () => Promise<void>) => operation()),
      updateDownloadProgress: jest.fn(async () => undefined),
      getFiles: jest.fn(async () => []),
      markFilesComplete: jest.fn(async () => undefined),
      getClaimedPaths: jest.fn(async () => []),
      reconcileAllocation: jest.fn(async () => undefined),
    };
    const bandwidth = {
      refreshTorrentPriorities: jest.fn(),
      resumeSpeculativeDownloadsWhenPlaybackReady: jest.fn(async () => undefined),
    };
    const tracker = new CompletionTracker(
      storageService as unknown as StorageService,
      {} as SeedScheduler,
      bandwidth as unknown as PlaybackBandwidth
    );
    const torrent = Object.assign(new EventEmitter(), {
      bitfield: { buffer: new Uint8Array([0b1000_0000]) },
      pieces: new Array(8),
      length: 32,
    }) as unknown as Torrent;
    const layout = {
      storeName: 's',
      pieceLength: 4,
      files: [],
    } as unknown as EncryptedStorageLayout;

    tracker.trackTorrent(torrent, 1, layout);
    torrent.emit('verified', 0);
    await flush();
    torrent.emit('verified', 1);
    await flush();

    expect(storageService.updateDownloadProgress).toHaveBeenCalledTimes(2);
  });

  it('decides and writes completion under the source lock, so a reclaim cannot interleave', async () => {
    let tail: Promise<unknown> = Promise.resolve();
    const withSourceLock = <T>(_id: number, operation: () => Promise<T>): Promise<T> => {
      const run = tail.then(operation);
      tail = run.catch(() => undefined);
      return run;
    };
    let releaseFiles!: () => void;
    const filesGate = new Promise<void>(resolve => (releaseFiles = resolve));
    const events: string[] = [];
    const torrent = { bitfield: { buffer: new Uint8Array([0b1100_0000]) } } as unknown as Torrent;
    const storageService = {
      withSourceLock,
      getFiles: jest.fn(async () => {
        await filesGate;
        return [{ path: 'a.mkv', completedAt: null }];
      }),
      markFilesComplete: jest.fn(async (_id: number, paths: string[]) => {
        events.push(`complete ${paths.join(',')}`);
      }),
      getClaimedPaths: jest.fn(async () => ['a.mkv']),
      markVideoCompleteLocked: jest.fn(async () => {
        events.push('source complete');
        return null;
      }),
    };
    const tracker = new CompletionTracker(
      storageService as unknown as StorageService,
      {} as SeedScheduler,
      {} as PlaybackBandwidth
    );
    const layout = {
      storeName: 's',
      pieceLength: 4,
      files: [{ path: 'a.mkv', offset: 0, length: 8 }],
    } as unknown as EncryptedStorageLayout;

    const recording = tracker.recordCompletion(torrent, 1, layout);
    await flush();
    // A reclaim of a.mkv asks for the lock while completion is still deciding.
    const reclaim = withSourceLock(1, async () => {
      events.push('reclaim');
    });
    releaseFiles();
    await Promise.all([recording, reclaim]);

    expect(events).toEqual(['complete a.mkv', 'source complete', 'reclaim']);
  });
});
