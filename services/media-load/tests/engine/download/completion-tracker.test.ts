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
});
