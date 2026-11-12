import { SeedScheduler } from '../../../src/engine/download/seed-scheduler';
import type { TorrentAttacher } from '../../../src/engine/download/torrent-attacher';
import { logger } from '../../../src/lib/logger';
import type { StorageService } from '../../../src/storage/storage.service';
import type { Storage } from '../../../src/storage/types';
import { advanceTimersByTimeAsync, testConfig } from '../../helpers/engine';

const SEED_SECONDS = 60;

const setup = () => {
  const torrent = { path: '/downloads/a' };
  const storageService = {
    getStorageBySource: jest.fn(),
    getStoragesWithCompletion: jest.fn(async () => [] as Storage[]),
    detachCompletedStorage: jest.fn(async (_id: number, detach: () => Promise<void>) => detach()),
  };
  const client = { remove: jest.fn(async () => undefined) };
  const torrents = {
    client,
    torrentAt: jest.fn((location?: string) => (location === torrent.path ? torrent : undefined)),
  };
  const scheduler = new SeedScheduler(
    storageService as unknown as StorageService,
    testConfig({ CONTENT_SEED_DURATION_SECONDS: SEED_SECONDS }),
    torrents as unknown as TorrentAttacher
  );
  return { scheduler, storageService, client, torrent };
};

const completed = (completedAt: Date, localOnly = false) =>
  ({ sourceId: 1, location: '/downloads/a', videoCompletedAt: completedAt, localOnly }) as Storage;

describe('SeedScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('places the seeding deadline one seed duration after completion', () => {
    const { scheduler } = setup();
    expect(scheduler.seedDeadline(new Date(1_000))).toBe(1_000 + SEED_SECONDS * 1_000);
  });

  it('detaches the torrent, keeping its files, when the seeding window ends', async () => {
    const { scheduler, storageService, client, torrent } = setup();
    const storage = completed(new Date());
    storageService.getStorageBySource.mockResolvedValue(storage);

    scheduler.scheduleSeedExpiry(storage);
    await advanceTimersByTimeAsync(SEED_SECONDS * 1_000 - 1);
    expect(storageService.detachCompletedStorage).not.toHaveBeenCalled();

    await advanceTimersByTimeAsync(1);
    expect(storageService.detachCompletedStorage).toHaveBeenCalledWith(1, expect.any(Function));
    expect(client.remove).toHaveBeenCalledWith(torrent, { destroyStore: false });
  });

  it('schedules nothing for local-only storage', async () => {
    const { scheduler, storageService } = setup();
    scheduler.scheduleSeedExpiry(completed(new Date(0), true));
    await advanceTimersByTimeAsync(SEED_SECONDS * 1_000);
    expect(storageService.getStorageBySource).not.toHaveBeenCalled();
  });

  it('drops a pending expiry when cancelled', async () => {
    const { scheduler, storageService } = setup();
    scheduler.scheduleSeedExpiry(completed(new Date()));
    scheduler.cancel(1);
    await advanceTimersByTimeAsync(SEED_SECONDS * 1_000);
    expect(storageService.getStorageBySource).not.toHaveBeenCalled();
  });

  it('retries a failed detach until it succeeds', async () => {
    const { scheduler, storageService } = setup();
    storageService.detachCompletedStorage
      .mockRejectedValueOnce(new Error('busy'))
      .mockRejectedValueOnce(new Error('still busy'));

    await scheduler.detachOrRetry(1, 'Could not detach');
    expect(storageService.detachCompletedStorage).toHaveBeenCalledTimes(1);

    await advanceTimersByTimeAsync(15_000);
    expect(storageService.detachCompletedStorage).toHaveBeenCalledTimes(2);
    await advanceTimersByTimeAsync(15_000);
    expect(storageService.detachCompletedStorage).toHaveBeenCalledTimes(3);
    await advanceTimersByTimeAsync(15_000);
    expect(storageService.detachCompletedStorage).toHaveBeenCalledTimes(3);
  });

  it('reschedules a source whose window was extended before it expired', async () => {
    const { scheduler, storageService } = setup();
    const storage = completed(new Date());
    scheduler.scheduleSeedExpiry(storage);
    // By the time the timer fires, completion moved forward (the source was reopened).
    storageService.getStorageBySource.mockResolvedValue(
      completed(new Date(Date.now() + SEED_SECONDS * 1_000))
    );

    await advanceTimersByTimeAsync(SEED_SECONDS * 1_000);
    expect(storageService.detachCompletedStorage).not.toHaveBeenCalled();
    await advanceTimersByTimeAsync(SEED_SECONDS * 1_000);
    expect(storageService.detachCompletedStorage).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending detach retry instead of stacking a second one', async () => {
    const { scheduler, storageService } = setup();
    scheduler.scheduleDetachRetry(1);
    scheduler.scheduleDetachRetry(1);
    scheduler.cancelAll();

    await advanceTimersByTimeAsync(60_000);
    expect(storageService.detachCompletedStorage).not.toHaveBeenCalled();
  });
});
