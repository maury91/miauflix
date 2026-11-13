import type { ClaimRequest } from '@miauflix/service-contracts';
import type { Torrent } from 'webtorrent';

import { paddedLength } from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { ErrorWithStatus } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import {
  type ClaimKind,
  type ContentSource,
  type EncryptedStorageLayout,
  type PlaybackTarget,
  SPECULATIVE_CLAIMS,
  type Storage,
} from '../../storage/types';
import type { EngineConfig } from '../engine-config';
import { claimStartPriority } from '../torrent-priority';
import { claimInput, type ClaimSelection } from './claim-selection';
import type { CompletionTracker } from './completion-tracker';
import { PLAYBACK_CLAIM } from './constants';
import {
  assertFileInLayout,
  createEncryptedLayout,
  getSelectedBytes,
  getTorrentPieceCount,
  isFileStored,
  randomStorageLocation,
  recoverEncryptedLayout,
  withSourceFilenameSalt,
} from './layout';
import type { PlaybackBandwidth } from './playback-bandwidth';
import type { PlaybackState } from './playback-state';
import type { SeedScheduler } from './seed-scheduler';
import type { TorrentAttacher } from './torrent-attacher';
import type { GreedyDownload } from './types';

/** A started download, and whether its seeding window has already ended. */
type StartedDownload = GreedyDownload & { shouldDetach: boolean };

export interface StartDownloadOptions {
  /** Admission charge used only while the source's file list is still unknown. */
  reservedBytes?: number;
}

/**
 * Getting a source's files onto disk and off the client again: admitting and claiming a file,
 * attaching its torrent (or reading it from disk when stored), resolving file lists, applying
 * claim changes, and detaching torrents nobody needs any more.
 */
export class DownloadLifecycle {
  constructor(
    private readonly storageService: StorageService,
    private readonly config: EngineConfig,
    private readonly torrents: TorrentAttacher,
    private readonly playback: PlaybackState,
    private readonly selection: ClaimSelection,
    private readonly bandwidth: PlaybackBandwidth,
    private readonly seeding: SeedScheduler,
    private readonly tracker: CompletionTracker
  ) {}

  /**
   * Start greedy download with storage tracking and priority management
   * Implements storage-conscious downloading for hobbyist constraints (150GB total storage)
   */
  async startDownload(
    target: PlaybackTarget,
    claim: ClaimRequest,
    options: StartDownloadOptions = {}
  ): Promise<GreedyDownload> {
    const { source } = target;
    const speculative = SPECULATIVE_CLAIMS.includes(claim.kind);
    try {
      logger.info('DownloadService', `Starting download for source ${source.id}`);

      await this.admitStorage(target, claim, speculative, options);
      const start = await this.storageService.withSourceLock(source.id, () =>
        this.claimAndAttach(target, claim, speculative)
      );

      // An explicit request resumes a paused source; background callers pause again if needed.
      this.selection.unpause(source.id);
      if (!start.torrent) {
        if (start.shouldDetach) {
          await this.seeding.detachOrRetry(
            source.id,
            `Seeding stop is pending for source ${source.id}`
          );
        }
        return start;
      }

      await this.followAttachedTorrent(source.id, start.torrent, start.layout);

      logger.info(
        'DownloadService',
        `Successfully started greedy download for source ${source.id}`
      );
      return start;
    } catch (error) {
      if (error instanceof ErrorWithStatus) {
        throw error;
      }
      logger.error(
        'DownloadService',
        `Failed to start greedy download for source ${source.id}:`,
        error
      );
      throw new ErrorWithStatus(
        `Failed to start greedy download: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'greedy_download_failed'
      );
    }
  }

  /**
   * Create (or update) the source's storage record with its first claim, charging the reserve
   * for the claimed files when they are known. A path the source does not contain is rejected
   * before it is claimed.
   */
  private async admitStorage(
    { source, filePath }: PlaybackTarget,
    claim: ClaimRequest,
    speculative: boolean,
    options: StartDownloadOptions
  ): Promise<void> {
    const existingStorage = await this.storageService.getStorageBySource(source.id);
    const knownLayout =
      existingStorage?.encryptedLayout ?? (await recoverEncryptedLayout(source).catch(() => null));
    if (knownLayout) assertFileInLayout(knownLayout, filePath);
    const claimedPaths = await this.storageService.getClaimedPaths(source.id);
    const reservation = await this.getSelectedFilesReservation(
      source,
      [...new Set([...claimedPaths, filePath])],
      existingStorage?.encryptedLayout ?? undefined
    );

    await this.storageService.createStorage({
      sourceId: source.id,
      location: this.generateStoragePath(),
      size: source.size || 0,
      downloadedPieces: new Uint8Array(0),
      totalPieces: 0,
      speculative,
      reservedBytes: reservation.known
        ? reservation.bytes
        : (options.reservedBytes ?? (speculative ? 0 : source.size)),
      partialReservation: reservation.known,
      claim: { path: filePath, input: claimInput(claim) },
    });
  }

  /**
   * Under the source lock: claim the file, then read it from disk when it is stored, or attach
   * the torrent for it.
   */
  private async claimAndAttach(
    target: PlaybackTarget,
    claim: ClaimRequest,
    speculative: boolean
  ): Promise<StartedDownload> {
    const { source, filePath } = target;
    let current = await this.storageService.getStorageBySource(source.id);
    if (!current) {
      throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
    }
    const savedLayout = current.encryptedLayout ?? (await recoverEncryptedLayout(source));
    if (savedLayout) assertFileInLayout(savedLayout, filePath);
    const stored = Boolean(
      savedLayout &&
        isFileStored(current, savedLayout, filePath, await this.storageService.getFiles(source.id))
    );
    current =
      (await this.storageService.claimFile(source.id, filePath, claimInput(claim), stored)) ??
      current;

    // A fully stored file is read from disk; the torrent stays as it is.
    if (stored && savedLayout) return this.useStoredFile(source, current, savedLayout);
    return this.attachForClaim(target, claim, speculative, current);
  }

  /** A stored file needs no torrent; its seeding may still have to stop. */
  private async useStoredFile(
    source: ContentSource,
    current: Storage,
    savedLayout: EncryptedStorageLayout
  ): Promise<StartedDownload> {
    const layout = withSourceFilenameSalt(savedLayout, source.hash);
    if (layout.filenameSalt !== current.encryptedLayout?.filenameSalt) {
      await this.storageService.updateEncryptedLayout(source.id, layout);
    }
    await this.storageService.recordFiles(source.id, layout);
    const expired = Boolean(
      current.videoCompletedAt && Date.now() >= this.seeding.seedDeadline(current.videoCompletedAt)
    );
    return {
      sourceId: source.id,
      torrent: null,
      storage: current,
      layout,
      shouldDetach: expired && !current.localOnly,
      startTime: new Date(),
    };
  }

  /** Attach the torrent for a claimed file and record its layout and reserve. */
  private async attachForClaim(
    { source, filePath }: PlaybackTarget,
    claim: ClaimRequest,
    speculative: boolean,
    current: Storage
  ): Promise<StartedDownload> {
    // Claiming an incomplete file reopened the source; its seed window no longer applies.
    this.seeding.cancel(source.id);

    // Serialize torrent startup against expiry detachment and storage deletion.
    const torrent = await this.torrents.addTorrentWithLock(
      source,
      current,
      claimStartPriority(claim.kind)
    );
    const layout = createEncryptedLayout(torrent, source.hash);
    if (!layout.files.some(file => file.path === filePath)) {
      // The files were unknown at admission; drop the claim on a path that does not exist.
      await this.storageService.releaseClaims(source.id, {
        kind: claim.kind,
        ownerKey: claim.ownerKey,
        path: filePath,
      });
      assertFileInLayout(layout, filePath);
    }
    await this.storageService.updateEncryptedLayout(source.id, layout);
    await this.storageService.recordFiles(source.id, layout);
    const required = await this.getSelectedFilesReservation(
      source,
      await this.storageService.getClaimedPaths(source.id),
      layout
    );
    if (required.known)
      await this.storageService.reserveStorage(source.id, required.bytes, speculative);
    return {
      sourceId: source.id,
      torrent,
      storage: current,
      layout,
      shouldDetach: false,
      startTime: new Date(),
    };
  }

  /** Record an attached torrent's geometry, then track, select and check it. */
  private async followAttachedTorrent(
    sourceId: number,
    torrent: Torrent,
    layout: EncryptedStorageLayout
  ): Promise<void> {
    const totalPieces = getTorrentPieceCount(torrent);

    // Patch storage with correct totalPieces and size after torrent is ready
    await this.storageService.updateDownloadProgress({
      sourceId,
      downloadedPieces: torrent.bitfield?.buffer || new Uint8Array(0),
      totalPieces,
      size: torrent.length,
    });
    await this.storageService.updateTorrentLayout(
      sourceId,
      totalPieces,
      torrent.pieceLength,
      torrent.length,
      getSelectedBytes(layout, await this.storageService.getClaimedPaths(sourceId))
    );
    await this.storageService.reconcileAllocation(sourceId);

    // Set up bitfield tracking
    this.tracker.trackTorrent(torrent, sourceId, layout);
    await this.selection.reconcileSelection(sourceId);
    await this.tracker.recordCompletion(torrent, sourceId, layout);
  }

  /** Estimate pack storage from selected files plus two boundary pieces per file. */
  private async getSelectedFilesReservation(
    source: ContentSource,
    paths: string[],
    knownLayout?: EncryptedStorageLayout
  ): Promise<{ bytes: number; known: boolean }> {
    let layout: EncryptedStorageLayout | null | undefined = knownLayout;
    try {
      layout ??= await recoverEncryptedLayout(source);
    } catch {
      return { bytes: source.size || 0, known: false };
    }
    if (!layout || !paths.length) return { bytes: source.size || 0, known: false };
    const uniquePaths = [...new Set(paths)];
    const files = uniquePaths.map(filePath => layout.files.find(file => file.path === filePath));
    if (files.some(file => !file)) return { bytes: source.size || 0, known: false };
    // Padded files take their padded size on disk. v1 files are never padded; a layout without a
    // version may also be a new download's .torrent, so the estimate assumes padding there.
    const pad =
      this.config.getOrThrow('STORAGE_PAD_FILE_SIZES') && (layout.encryptionVersion ?? 2) !== 1;
    const onDisk = (length: number) => (pad && length > 0 ? paddedLength(length) : length);
    const contentBytes = files.reduce((total, file) => total + onDisk(file?.length ?? 0), 0);
    const boundaryBytes = layout.pieceLength * 2 * uniquePaths.length;
    const packBytes = layout.files.reduce((total, file) => total + onDisk(file.length), 0);
    return {
      bytes: Math.max(1, Math.min(packBytes, contentBytes + boundaryBytes)),
      known: true,
    };
  }

  private generateStoragePath(): string {
    return randomStorageLocation(this.config.getOrThrow('DOWNLOAD_PATH'));
  }

  /** File list of a source, from storage or its torrent file, without attaching the torrent. */
  async getKnownLayout(source: ContentSource): Promise<EncryptedStorageLayout | null> {
    const storage = await this.storageService.getStorageBySource(source.id);
    return storage?.encryptedLayout ?? (await recoverEncryptedLayout(source));
  }

  /**
   * File list of a source. When neither storage nor a torrent file knows it, the torrent is
   * attached with nothing selected so its metadata arrives through the normal download path.
   */
  async resolveLayout(source: ContentSource): Promise<EncryptedStorageLayout> {
    const known = await this.getKnownLayout(source);
    if (known) return known;
    await this.storageService.createStorage({
      sourceId: source.id,
      location: this.generateStoragePath(),
      size: source.size || 0,
      downloadedPieces: new Uint8Array(0),
      totalPieces: 0,
      speculative: true,
      reservedBytes: 0,
    });
    return this.storageService.withSourceLock(source.id, async () => {
      const current = await this.storageService.getStorageBySource(source.id);
      if (!current) {
        throw new ErrorWithStatus('Storage record is unavailable', 'local_media_unavailable');
      }
      if (current.encryptedLayout) return current.encryptedLayout;
      const torrent = await this.torrents.addTorrentWithLock(source, current);
      const layout = createEncryptedLayout(torrent, source.hash);
      await this.storageService.updateEncryptedLayout(source.id, layout);
      await this.storageService.recordFiles(source.id, layout);
      return layout;
    });
  }

  /** Re-apply selection after claims changed outside a download request, then check completion. */
  async refreshClaims(sourceId: number): Promise<void> {
    await this.selection.reconcileSelection(sourceId);
    const storage = await this.storageService.getStorageBySource(sourceId);
    const torrent = storage && this.torrents.torrentAt(storage.location);
    if (torrent?.ready && storage?.encryptedLayout)
      await this.tracker.recordCompletion(torrent, sourceId, storage.encryptedLayout);
    await this.detachUnclaimedTorrent(sourceId);
  }

  /**
   * Take a torrent nobody needs off the client: no live claim, open stream, pending start or
   * seed window. A deselected torrent still holds its peers and buffers, so leaving it attached
   * costs CPU and memory indefinitely. Encrypted files stay on disk; a new claim attaches it again.
   */
  async detachUnclaimedTorrent(sourceId: number): Promise<void> {
    await this.storageService.withSourceLock(sourceId, async () => {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) return;
      const torrent = this.torrents.torrentAt(storage.location);
      if (!torrent || torrent.destroyed) return;
      if (torrent.infoHash && this.torrents.isStarting(torrent.infoHash)) return;
      if (
        storage.videoCompletedAt &&
        !storage.localOnly &&
        Date.now() < this.seeding.seedDeadline(storage.videoCompletedAt)
      ) {
        return;
      }
      // Sources sharing a hash share the torrent; every one of them must be done with it.
      const sourceIds = new Set([sourceId, ...(this.tracker.sourcesOf(torrent) ?? [])]);
      for (const id of sourceIds) {
        if (this.playback.isPlaybackActive(id)) return;
        if ((await this.storageService.getLiveClaims(id)).length) return;
      }
      if (torrent.bitfield?.buffer) {
        await this.storageService.updateDownloadProgress({
          sourceId,
          downloadedPieces: new Uint8Array(torrent.bitfield.buffer),
          totalPieces: getTorrentPieceCount(torrent),
          size: torrent.length,
        });
      }
      await this.torrents.client.remove(torrent, { destroyStore: false });
      for (const id of sourceIds) {
        this.selection.unpause(id);
        this.bandwidth.forget(id);
        try {
          await this.storageService.releaseReservation(id);
        } catch (error) {
          logger.warn('DownloadService', `Failed to release reservation for source ${id}`, error);
        }
      }
      logger.info('DownloadService', `Detached unclaimed torrent for source ${sourceId}`);
    });
  }

  /** Drop expired claims and stop downloading what nobody wants any more. */
  async sweepExpiredClaims(): Promise<void> {
    try {
      await this.renewActivePlaybackClaims();
      const sourceIds = await this.storageService.deleteClaims({ expiredAt: new Date() });
      // Their claims are gone already: one source failing must not leave the rest attached.
      for (const sourceId of sourceIds) {
        try {
          await this.refreshClaims(sourceId);
        } catch (error) {
          logger.warn('DownloadService', `Failed to refresh claims for source ${sourceId}`, error);
        }
      }
    } catch (error) {
      logger.warn('DownloadService', 'Failed to sweep expired storage claims', error);
    }
  }

  /**
   * A stream claims its file once, when it starts. Renew the claim of every file still being
   * read (sweeps run well inside the claim lifetime) so a long playback is not deselected.
   */
  private async renewActivePlaybackClaims(): Promise<void> {
    for (const [sourceId, paths] of this.playback.activeFilesBySource()) {
      for (const path of paths.keys()) {
        try {
          await this.storageService.claimFile(sourceId, path, claimInput(PLAYBACK_CLAIM), true);
        } catch (error) {
          logger.warn('DownloadService', 'Failed to renew playback claim', sourceId, error);
        }
      }
    }
  }

  /** Withdraw one owner's claims on a source (for example a removed watchlist entry). */
  async releaseClaims(sourceId: number, ownerKey: string, kind?: ClaimKind): Promise<void> {
    await this.storageService.releaseClaims(sourceId, { ownerKey, kind });
    await this.refreshClaims(sourceId);
  }

  /**
   * Remove/cancel download for a movie source
   */
  async cancelDownload(sourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${sourceId}`);
        return false;
      }

      // StorageService serializes deletion with lifecycle detachment and removes both the
      // torrent and encrypted files through the registered cleanup handler.
      await this.storageService.removeStorage(sourceId);
      this.selection.unpause(sourceId);
      this.bandwidth.forget(sourceId);
      logger.info(
        'DownloadService',
        `Cancelled download and cleaned up storage for movie source ${sourceId}`
      );

      return true;
    } catch (error) {
      logger.error('DownloadService', `Failed to cancel download for source ${sourceId}:`, error);
      return false;
    }
  }
}
