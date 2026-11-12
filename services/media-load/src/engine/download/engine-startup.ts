import { access, constants, mkdir } from 'fs/promises';

import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import type { EngineConfig } from '../engine-config';
import type { ClaimSelection } from './claim-selection';
import type { CompletionTracker } from './completion-tracker';
import { createEncryptedLayout, withSourceFilenameSalt } from './layout';
import type { SeedScheduler } from './seed-scheduler';
import type { TorrentAttacher } from './torrent-attacher';
import type { EngineStatus } from './types';

/**
 * Engine startup and the seeding restore: load trackers, check the download directory, drop
 * stale playback claims, then attach every completed download whose seeding window is still
 * open (and detach expired ones). Seeding reaches peers, so the restore waits for a protected
 * connection and runs again if the network was blocked while it ran.
 */
export class EngineStartup {
  private _initStatus: EngineStatus = {
    status: 'initializing',
    details: 'Starting up',
    startedAt: Date.now(),
  };
  /** Seeding restore waits for the network when it was blocked at startup. */
  private restorePending = false;
  /** Counts network blocks, so a restore pass knows it was interrupted even after a reconnect. */
  private networkBlocks = 0;

  constructor(
    private readonly storageService: StorageService,
    private readonly config: EngineConfig,
    private readonly torrents: TorrentAttacher,
    private readonly selection: ClaimSelection,
    private readonly seeding: SeedScheduler,
    private readonly tracker: CompletionTracker
  ) {}

  getStatus(): EngineStatus {
    return this._initStatus;
  }

  /** A restore must run (again) once the network is allowed. */
  markRestorePending(): void {
    this.restorePending = true;
  }

  /** The network was just blocked; a restore pass running now must not count as complete. */
  noteNetworkBlocked(): void {
    this.networkBlocks++;
  }

  async init(): Promise<void> {
    const startedAt = Date.now();
    this._initStatus = { status: 'initializing', details: 'Loading trackers', startedAt };
    try {
      await this.torrents.loadTrackers();
      this._initStatus = {
        status: 'initializing',
        details: 'Checking download directory',
        startedAt,
      };
    } catch (err) {
      this._initStatus = {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to load trackers',
        error: err,
      };
    }
    if (this._initStatus.status !== 'error') {
      try {
        const downloadPath = this.config.getOrThrow('DOWNLOAD_PATH');
        await mkdir(downloadPath, { recursive: true });
        await access(downloadPath, constants.W_OK);
        this._initStatus = { status: 'ready' };
        // Nothing is streaming yet; playback claims from a previous run are stale.
        await this.storageService.deleteClaims({ kind: 'playback' });
        await this.restoreCompletedDownloads();
      } catch (err) {
        this._initStatus = {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Failed to access download directory',
          error: err,
        };
      }
    }
  }

  /**
   * Take over storage recorded elsewhere (the backend's import): seed completed downloads whose
   * seeding period has not ended, detach expired ones, and schedule the rest.
   */
  async adoptStorage(): Promise<void> {
    await this.restoreCompletedDownloads();
    await this.seeding.rescheduleSeedExpiry();
  }

  async reload(): Promise<void> {
    await this.init();
    await this.seeding.rescheduleSeedExpiry();
  }

  /** The network is allowed again: run a seeding restore that waited for it. */
  async restoreIfPending(): Promise<void> {
    if (this.restorePending && this._initStatus.status === 'ready') {
      this.restorePending = false;
      await this.restoreCompletedDownloads().catch(error =>
        logger.warn('DownloadService', 'Could not restore seeding', error)
      );
    }
  }

  private async restoreCompletedDownloads(): Promise<void> {
    // Seeding reaches peers: wait for a protected connection (`setNetworkAllowed`).
    if (!this.torrents.isNetworkAllowed) {
      this.restorePending = true;
      return;
    }
    const blocks = this.networkBlocks;
    const completed = (await this.storageService.getStoragesWithCompletion()) ?? [];
    for (const storage of completed) {
      if (storage.localOnly) continue;
      if (!storage.contentSource) continue;
      if (this.seeding.seedDeadline(storage.videoCompletedAt!) <= Date.now()) {
        await this.seeding.detachOrRetry(
          storage.sourceId,
          `Could not detach expired source ${storage.sourceId}`
        );
        continue;
      }
      try {
        await this.storageService.withSourceLock(storage.sourceId, () =>
          this.restoreSeeding(storage.sourceId)
        );
      } catch (error) {
        // Blocked mid-restore (even if already allowed again): the rest seeds once allowed.
        if (this.networkBlocks !== blocks) this.restorePending = true;
        logger.warn(
          'DownloadService',
          `Could not restore seeding for completed source ${storage.sourceId}`,
          error
        );
      }
      await this.selection
        .reconcileSelection(storage.sourceId)
        .catch(error =>
          logger.warn('DownloadService', `Could not reselect source ${storage.sourceId}`, error)
        );
    }
    // The network came back before this pass noticed the interruption: retry now.
    if (
      this.restorePending &&
      this.torrents.isNetworkAllowed &&
      this._initStatus.status === 'ready'
    ) {
      this.restorePending = false;
      await this.restoreCompletedDownloads();
    }
  }

  /** Under the source lock: attach a completed source again if it should still seed. */
  private async restoreSeeding(sourceId: number): Promise<void> {
    const current = await this.storageService.getStorageBySource(sourceId);
    if (
      !current ||
      current.localOnly ||
      !current.videoCompletedAt ||
      !current.contentSource ||
      this.seeding.seedDeadline(current.videoCompletedAt) <= Date.now()
    ) {
      return;
    }
    const torrent = await this.torrents.addTorrentWithLock(current.contentSource, current);
    const savedLayout =
      current.encryptedLayout ?? createEncryptedLayout(torrent, current.contentSource.hash);
    const layout = withSourceFilenameSalt(savedLayout, current.contentSource.hash);
    await this.storageService.updateEncryptedLayout(current.sourceId, layout);
    await this.storageService.recordFiles(current.sourceId, layout);
    this.tracker.trackTorrent(torrent, current.sourceId, layout);
    this.seeding.scheduleSeedExpiry(current);
  }
}
