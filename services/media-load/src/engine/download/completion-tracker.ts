import type { Torrent } from 'webtorrent';

import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import type { EncryptedStorageLayout } from '../../storage/types';
import { isFileCompleteInBitfield } from '../download.utils';
import { getTorrentPieceCount } from './layout';
import type { PlaybackBandwidth } from './playback-bandwidth';
import type { SeedScheduler } from './seed-scheduler';

/** Allocation is reconciled at most this often per source while pieces verify. */
const ALLOCATION_RECONCILE_INTERVAL_MS = 1_000;

/**
 * Follows attached torrents for the sources that use them: persists their verified pieces,
 * keeps the disk allocation current, and records files and sources complete, which starts the
 * seeding window.
 */
export class CompletionTracker {
  /** Sources tracked on each torrent; sources sharing a hash share the torrent. */
  private readonly bitfieldTrackedTorrents = new WeakMap<Torrent, Set<number>>();
  /** When each source's allocation was last reconciled. */
  private readonly allocationReconcileAt = new Map<number, number>();
  private readonly allocationReconcileInFlight = new Map<number, Promise<void>>();

  constructor(
    private readonly storageService: StorageService,
    private readonly seeding: SeedScheduler,
    private readonly bandwidth: PlaybackBandwidth
  ) {}

  /** Sources tracked on a torrent. */
  sourcesOf(torrent: Torrent): ReadonlySet<number> | undefined {
    return this.bitfieldTrackedTorrents.get(torrent);
  }

  /** Follow a torrent's progress for a source; tracking the same pair twice does nothing. */
  trackTorrent(torrent: Torrent, sourceId: number, layout: EncryptedStorageLayout): void {
    const trackedSourceIds = this.bitfieldTrackedTorrents.get(torrent) ?? new Set<number>();
    if (trackedSourceIds.has(sourceId)) return;
    trackedSourceIds.add(sourceId);
    this.bitfieldTrackedTorrents.set(torrent, trackedSourceIds);
    this.setupBitfieldTracking(torrent, sourceId, layout);
    this.bandwidth.refreshTorrentPriorities();
  }

  /**
   * Mark files complete as their pieces verify, then the source once every claimed file is,
   * which starts its seeding window.
   */
  async recordCompletion(
    torrent: Torrent,
    sourceId: number,
    layout: EncryptedStorageLayout
  ): Promise<void> {
    const bitfield = torrent.bitfield?.buffer;
    const files = await this.storageService.getFiles(sourceId);
    const newlyComplete = files
      .filter(file => !file.completedAt && isFileCompleteInBitfield(layout, file.path, bitfield))
      .map(file => file.path);
    await this.storageService.markFilesComplete(sourceId, newlyComplete);
    const complete = new Set([
      ...files.filter(file => file.completedAt).map(file => file.path),
      ...newlyComplete,
    ]);
    // A claim on a path the source does not contain can never complete; it must not block others.
    const claimed = (await this.storageService.getClaimedPaths(sourceId)).filter(path =>
      layout.files.some(file => file.path === path)
    );
    if (!claimed.length || !claimed.every(path => complete.has(path))) return;
    const storage = await this.storageService.markVideoComplete(sourceId, layout);
    if (storage) this.seeding.scheduleSeedExpiry(storage);
  }

  /**
   * Set up bitfield tracking for storage service integration
   */
  private setupBitfieldTracking(
    torrent: Torrent,
    sourceId: number,
    layout: EncryptedStorageLayout
  ): void {
    // Verifies arrive in bursts; one pending write covers them all. The bitfield is read once the
    // write holds the source lock, so a write queued before a reclaim cannot restore its bits.
    // The entry is published before the lock call, so it is cleared correctly even when the lock
    // runs the operation before returning.
    let pendingWrite: { promise?: Promise<void> } | null = null;
    const persistBitfield = (): Promise<void> => {
      if (pendingWrite?.promise) return pendingWrite.promise;
      const entry: { promise?: Promise<void> } = {};
      pendingWrite = entry;
      entry.promise = this.storageService.withSourceLock(sourceId, async () => {
        if (pendingWrite === entry) pendingWrite = null;
        const bitfieldBuffer = torrent.bitfield?.buffer
          ? Buffer.from(torrent.bitfield.buffer)
          : new Uint8Array(0);
        await this.storageService.updateDownloadProgress({
          sourceId,
          downloadedPieces: new Uint8Array(bitfieldBuffer),
          totalPieces: getTorrentPieceCount(torrent),
          size: torrent.length,
        });
      });
      return entry.promise;
    };

    torrent.on('verified', async () => {
      try {
        await persistBitfield();
        await this.reconcileAllocationIfDue(sourceId);
        await this.recordCompletion(torrent, sourceId, layout);
        await this.bandwidth.resumeSpeculativeDownloadsWhenPlaybackReady();
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to update download progress for source ${sourceId}:`,
          error
        );
      }
    });

    torrent.on('done', async () => {
      try {
        await this.reconcileAllocationIfDue(sourceId, true);
        await this.storageService.markAsAccessed(sourceId);
        logger.info('DownloadService', `Download completed for movie source ${sourceId}`);
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to mark download as complete for source ${sourceId}:`,
          error
        );
      }
    });

    void this.recordCompletion(torrent, sourceId, layout).catch(error => {
      logger.warn(
        'DownloadService',
        `Failed to record video completion for source ${sourceId}`,
        error
      );
    });
  }

  private async reconcileAllocationIfDue(sourceId: number, force = false): Promise<void> {
    const inFlight = this.allocationReconcileInFlight.get(sourceId);
    if (inFlight) {
      if (!force) return inFlight;
      await inFlight.catch(() => undefined);
      return this.reconcileAllocationIfDue(sourceId, true);
    }
    const now = Date.now();
    if (
      !force &&
      now - (this.allocationReconcileAt.get(sourceId) ?? 0) < ALLOCATION_RECONCILE_INTERVAL_MS
    )
      return;
    const reconcile = this.storageService
      .reconcileAllocation(sourceId)
      .then(() => {
        this.allocationReconcileAt.set(sourceId, Date.now());
      })
      .finally(() => {
        if (this.allocationReconcileInFlight.get(sourceId) === reconcile) {
          this.allocationReconcileInFlight.delete(sourceId);
        }
      });
    this.allocationReconcileInFlight.set(sourceId, reconcile);
    return reconcile;
  }
}
