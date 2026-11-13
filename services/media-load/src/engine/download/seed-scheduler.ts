import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import type { Storage } from '../../storage/types';
import type { EngineConfig } from '../engine-config';
import type { TorrentAttacher } from './torrent-attacher';

/** Longest delay setTimeout accepts without firing at once. */
const MAX_TIMER_MS = 2_147_000_000;
const DETACH_RETRY_MS = 15_000;

/**
 * The seeding window of completed downloads: one timer per source that takes its torrent off
 * the client (files kept) when the window ends, retrying until that succeeds.
 */
export class SeedScheduler {
  /** Seed-expiry or detach-retry timer, by source. */
  private readonly seedTimers = new Map<number, NodeJS.Timeout>();

  constructor(
    private readonly storageService: StorageService,
    private readonly config: EngineConfig,
    private readonly torrents: TorrentAttacher
  ) {}

  getSeedDurationMs(): number {
    return Number(this.config.getOrThrow('CONTENT_SEED_DURATION_SECONDS')) * 1_000;
  }

  /** When the seeding window of a download completed at `completedAt` ends, in epoch ms. */
  seedDeadline(completedAt: Date): number {
    return completedAt.getTime() + this.getSeedDurationMs();
  }

  /** Drop a source's pending expiry or retry, if any. */
  cancel(sourceId: number): void {
    const timer = this.seedTimers.get(sourceId);
    if (timer) clearTimeout(timer);
    this.seedTimers.delete(sourceId);
  }

  /** Drop every pending timer (shutdown). */
  cancelAll(): void {
    for (const timer of this.seedTimers.values()) clearTimeout(timer);
    this.seedTimers.clear();
  }

  /** Apply the current seed duration to completed downloads without resetting playback claims. */
  async rescheduleSeedExpiry(): Promise<void> {
    const completed = (await this.storageService.getStoragesWithCompletion()) ?? [];
    for (const storage of completed) this.scheduleSeedExpiry(storage);
  }

  scheduleSeedExpiry(storage: Storage): void {
    this.cancel(storage.sourceId);
    if (!storage.videoCompletedAt || storage.localOnly) return;
    const deadline = this.seedDeadline(storage.videoCompletedAt);
    const timer = setTimeout(
      () => {
        this.seedTimers.delete(storage.sourceId);
        void this.expireCompletedTorrent(storage.sourceId);
      },
      Math.max(0, Math.min(deadline - Date.now(), MAX_TIMER_MS))
    );
    timer.unref?.();
    this.seedTimers.set(storage.sourceId, timer);
  }

  private async expireCompletedTorrent(sourceId: number): Promise<void> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage?.videoCompletedAt || storage.localOnly) return;
      if (Date.now() < this.seedDeadline(storage.videoCompletedAt)) {
        this.scheduleSeedExpiry(storage);
        return;
      }
      await this.detachCompletedTorrent(sourceId);
    } catch (error) {
      logger.warn('DownloadService', `Failed to stop seeding source ${sourceId}; retrying`, error);
      this.scheduleDetachRetry(sourceId);
    }
  }

  scheduleDetachRetry(sourceId: number): void {
    // Replace, never stack: a lost handle could not be cancelled, and would fire after shutdown.
    this.cancel(sourceId);
    const timer = setTimeout(() => {
      this.seedTimers.delete(sourceId);
      void this.detachCompletedTorrent(sourceId).catch(error => {
        logger.warn('DownloadService', `Retry failed to stop seeding source ${sourceId}`, error);
        this.scheduleDetachRetry(sourceId);
      });
    }, DETACH_RETRY_MS);
    timer.unref?.();
    this.seedTimers.set(sourceId, timer);
  }

  /** Stop seeding a source now: its torrent leaves the client, its encrypted files stay. */
  async detachCompletedTorrent(sourceId: number): Promise<void> {
    await this.storageService.detachCompletedStorage(sourceId, async () => {
      const storage = await this.storageService.getStorageBySource(sourceId);
      const torrent = this.torrents.torrentAt(storage?.location);
      if (torrent) await this.torrents.client.remove(torrent, { destroyStore: false });
    });
    this.cancel(sourceId);
    logger.info('DownloadService', `Stopped seeding source ${sourceId}; encrypted files retained`);
  }

  /** Stop seeding a source whose window ended, retrying later if that fails. */
  async detachOrRetry(sourceId: number, failureMessage: string): Promise<void> {
    try {
      await this.detachCompletedTorrent(sourceId);
    } catch (error) {
      logger.warn('DownloadService', failureMessage, error);
      this.scheduleDetachRetry(sourceId);
    }
  }
}
