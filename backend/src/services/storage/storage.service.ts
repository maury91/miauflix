import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, stat, statfs, unlink } from 'node:fs/promises';

import { logger } from '@logger';
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';

import type { Database } from '@database/database';
import type { EncryptedStorageLayout, Storage } from '@entities/storage.entity';
import type { StorageFile } from '@entities/storage-file.entity';
import {
  CLAIM_RANK,
  type ClaimKind,
  type StorageFileClaim,
} from '@entities/storage-file-claim.entity';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { StorageRepository } from '@repositories/storage.repository';
import type { ClaimInput, StorageFileRepository } from '@repositories/storage-file.repository';
import { humanReadableBytes } from '@utils/numbers';
import { traced } from '@utils/tracing.util';

import {
  clearPiecesInBitfield,
  isFileCompleteInBitfield,
  isPieceInBitfield,
  pieceRangeOf,
} from '../download/download.utils';

export type StorageRemovalResult =
  | { status: 'active_playback' | 'cleanup_failed' | 'not_found' }
  | { status: 'removed'; bytes: number };

export type StorageReclaimResult =
  | { status: 'active_playback' | 'cleanup_failed' | 'kept_last' | 'not_found' | 'nothing' }
  | { status: 'reclaimed' | 'removed'; bytes: number };

/** Inclusive piece range. */
export interface PieceRange {
  first: number;
  last: number;
}

/** What the download layer does physically when files of a storage are reclaimed. */
export interface ReclaimHandler {
  /**
   * Delete the encrypted files of `paths` and clear `pieces` (which include boundary pieces shared
   * with neighbors) from any attached torrent. Returns the torrent's bitfield when one is attached.
   */
  reclaim(storage: Storage, paths: string[], pieces: PieceRange[]): Promise<Uint8Array | void>;
  /** Called after the lock is released: reapply selection and refetch what claimed files lost. */
  reselect(storage: Storage): Promise<void>;
}

/** Speculative admission may evict storage held only by warmups and watchlist downloads. */
const SPECULATIVE_EVICTION_RANK = CLAIM_RANK.watchlist;
/** Retained admission (watching) may also evict watched and prefetched storage, never playback. */
const RETAINED_EVICTION_RANK = CLAIM_RANK.prefetch;

export interface StorageInventory {
  items: Array<Storage & { requestedFiles: string[] }>;
  physicalBytes: number | null;
  storageBudgetBytes: number;
  reservedBytes: number;
  chargedBytes: number;
  filesystem: { totalBytes: number; freeBytes: number } | null;
}

/**
 * Service for tracking and managing storage of downloaded movie sources
 */
export class StorageService extends (EventEmitter as new () => TypedEmitter<{
  delete: (storage: Storage) => void;
}>) {
  getStatus(): ServiceInstanceStatus {
    return { status: 'ready' };
  }
  private readonly storageRepository: StorageRepository;
  private readonly storageFiles: StorageFileRepository;
  private maxStorageBytes: bigint;
  private playbackReserveBytes: bigint;
  private readonly config: ConfigService;
  private admissionTail: Promise<void> = Promise.resolve();
  private allocationMode: AllocationMode = 'unknown';
  private readonly deleteHandlers: Array<(storage: Storage) => Promise<void> | void> = [];
  private reclaimHandler: ReclaimHandler | null = null;
  private readonly sourceTails = new Map<number, Promise<void>>();

  constructor(db: Database, config: ConfigService) {
    super();
    this.config = config;
    this.storageRepository = db.getStorageRepository();
    this.storageFiles = db.getStorageFileRepository();
    this.maxStorageBytes = config.getOrThrow('STORAGE_THRESHOLD');
    this.playbackReserveBytes = config.get('STORAGE_PLAYBACK_RESERVE') ?? 0n;
    config.registerService('STORAGE', this);
    void this.probeAllocationMode();
  }

  testable = false;
  async reload(): Promise<void> {
    this.maxStorageBytes = this.config.getOrThrow('STORAGE_THRESHOLD');
    this.playbackReserveBytes = this.config.get('STORAGE_PLAYBACK_RESERVE') ?? 0n;
    await this.probeAllocationMode();
  }

  registerDeleteHandler(handler: (storage: Storage) => Promise<void> | void): void {
    this.deleteHandlers.push(handler);
  }

  registerReclaimHandler(handler: ReclaimHandler): void {
    this.reclaimHandler = handler;
  }

  /**
   * Create a new storage record for a movie source
   * Checks storage pressure and performs cleanup if needed before creating new storage
   */
  @traced('StorageService')
  async createStorage(params: {
    sourceId: number;
    location: string;
    size: number;
    downloadedPieces?: Uint8Array;
    totalPieces?: number;
    pieceLength?: number;
    /** Speculative admission keeps the playback reserve and evicts only speculative storage. */
    speculative?: boolean;
    reservedBytes?: number;
    /** Reserve only the requested file set when a shared torrent pack is used. */
    partialReservation?: boolean;
    /**
     * The claim this admission is for, recorded in the same admission step so a newly admitted
     * row is never unclaimed (and therefore evictable) before its owner records it.
     */
    claim?: { path: string; input: ClaimInput };
  }): Promise<Storage> {
    const {
      sourceId,
      location,
      size,
      downloadedPieces,
      totalPieces,
      pieceLength,
      speculative = false,
      reservedBytes,
      partialReservation = false,
      claim,
    } = params;
    const requestedReservation = reservedBytes ?? (speculative ? 0 : size);
    const reservation =
      requestedReservation > 0 && this.allocationMode !== 'sparse'
        ? partialReservation
          ? requestedReservation
          : Math.max(requestedReservation, size)
        : requestedReservation;

    // Create empty bitfield if not provided
    const bitfield = downloadedPieces || new Uint8Array(0);

    // Calculate downloaded progress from bitfield if provided
    const downloaded =
      totalPieces && bitfield.length > 0
        ? await this.calculateProgressFromBitfield(bitfield, totalPieces)
        : 0;

    const storageData: Partial<Storage> = {
      sourceId,
      location,
      size,
      downloadedPieces: bitfield,
      downloaded,
      logicalBytes: size,
      verifiedBytes: 0,
      allocatedBytes: 0,
      reservedBytes: reservation,
      totalPieces: totalPieces ?? 0,
      pieceLength: pieceLength ?? 0,
      lastInterestAt: new Date(),
      activeStreams: 0,
      lastAccessAt: null,
      lastWriteAt: null,
      videoCompletedAt: null,
      localOnly: false,
      encryptedLayout: null,
    };

    const reselects: Storage[] = [];
    try {
      return await this.withAdmission(async () => {
        const current = await this.storageRepository.findBySourceId(sourceId);
        const currentCharge = current
          ? Math.max(current.allocatedBytes ?? 0, current.reservedBytes ?? 0)
          : 0;
        const nextReservation = Math.max(current?.reservedBytes ?? 0, reservation);
        const nextCharge = Math.max(current?.allocatedBytes ?? 0, nextReservation);
        const delta = nextCharge - currentCharge;

        if (delta > 0) {
          await this.cleanupWithinAdmission(
            true,
            delta,
            sourceId,
            speculative,
            speculative ? SPECULATIVE_EVICTION_RANK : RETAINED_EVICTION_RANK,
            reselects
          );
          await this.assertCapacity(delta, speculative);
        }

        if (current) {
          await this.storageRepository.update(current.id, {
            reservedBytes: nextReservation,
            lastInterestAt: new Date(),
          });
          if (claim) await this.storageFiles.upsertClaim(current.id, claim.path, claim.input);
          return (await this.storageRepository.findBySourceId(sourceId)) ?? current;
        }

        const created = await this.storageRepository.create(storageData);
        if (claim) await this.storageFiles.upsertClaim(created.id, claim.path, claim.input);
        return created;
      });
    } finally {
      this.reselectAfterAdmission(reselects);
    }
  }

  /**
   * Update download progress and bitfield for a storage record
   */
  @traced('StorageService')
  async updateDownloadProgress(params: {
    sourceId: number;
    downloadedPieces: Uint8Array;
    totalPieces: number;
    size?: number;
  }): Promise<void> {
    const { sourceId, downloadedPieces, totalPieces, size } = params;

    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${sourceId}`);
      return;
    }

    if (
      !Number.isInteger(totalPieces) ||
      totalPieces <= 0 ||
      (size !== undefined && (!Number.isFinite(size) || size < 0))
    ) {
      logger.warn(
        'StorageService',
        `Ignoring download progress with invalid torrent metadata for movie source ${sourceId}`
      );
      return;
    }

    // Calculate downloaded progress from bitfield
    const downloaded = await this.calculateProgressFromBitfield(downloadedPieces, totalPieces);

    await this.storageRepository.updateDownloadProgress(
      storage.id,
      downloaded,
      downloadedPieces,
      size
    );

    const verifiedBytes = size
      ? Math.min(size, Math.round((downloaded / 10000) * size))
      : storage.verifiedBytes;
    await this.storageRepository.updateAccounting(storage.id, {
      logicalBytes: size ?? storage.logicalBytes ?? storage.size,
      verifiedBytes,
    });

    logger.debug(
      'StorageService',
      `Updated download progress for movie source ${sourceId}: ${(downloaded / 100).toFixed(2)}%`
    );
  }

  async updateTorrentLayout(
    sourceId: number,
    totalPieces: number,
    pieceLength: number,
    logicalBytes: number,
    selectedLogicalBytes?: number
  ): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) return;
    if (
      !Number.isInteger(totalPieces) ||
      totalPieces <= 0 ||
      !Number.isInteger(pieceLength) ||
      pieceLength <= 0 ||
      !Number.isFinite(logicalBytes) ||
      logicalBytes < 0
    ) {
      logger.warn('StorageService', `Ignoring invalid torrent layout for movie source ${sourceId}`);
      return;
    }
    await this.storageRepository.update(storage.id, {
      totalPieces,
      pieceLength,
      logicalBytes: selectedLogicalBytes ?? logicalBytes,
      size: logicalBytes,
    });
  }

  /**
   * Mark a storage record as accessed
   */
  @traced('StorageService')
  async markAsAccessed(sourceId: number): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${sourceId}`);
      return;
    }

    await this.storageRepository.update(storage.id, {
      lastInterestAt: new Date(),
    });
    await this.storageRepository.updateLastAccess(storage.id);

    logger.debug('StorageService', `Updated last access time for storage ${storage.id}`);
  }

  /**
   * Get storage information for a movie source
   */
  @traced('StorageService')
  async getStorageBySource(sourceId: number): Promise<Storage | null> {
    return this.storageRepository.findBySourceId(sourceId);
  }

  async getStoragesWithCompletion(): Promise<Storage[]> {
    return this.storageRepository.findStoragesWithCompletion();
  }

  async updateEncryptedLayout(
    sourceId: number,
    encryptedLayout: EncryptedStorageLayout
  ): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) return;
    if (storage.encryptedLayout?.filenameSalt === encryptedLayout.filenameSalt) return;
    const next = storage.encryptedLayout
      ? { ...storage.encryptedLayout, filenameSalt: encryptedLayout.filenameSalt }
      : encryptedLayout;
    await this.storageRepository.update(storage.id, { encryptedLayout: next });
  }

  /** Record a source's file table once its layout is known. */
  async recordFiles(sourceId: number, layout: EncryptedStorageLayout): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (storage) await this.storageFiles.upsertFiles(storage.id, layout.files);
  }

  async getFiles(sourceId: number): Promise<StorageFile[]> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    return storage ? this.storageFiles.findFiles(storage.id) : [];
  }

  async markFilesComplete(sourceId: number, paths: string[]): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (storage) await this.storageFiles.markFilesComplete(storage.id, paths);
  }

  /**
   * Record one owner's claim on a file. Claiming an incomplete file reopens a completed source,
   * which cancels its seeding window and lets the torrent attach again.
   */
  async claimFile(
    sourceId: number,
    path: string,
    claim: ClaimInput,
    fileComplete: boolean
  ): Promise<Storage | null> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) return null;
    await this.storageFiles.upsertClaim(storage.id, path, claim);
    if (fileComplete || (!storage.videoCompletedAt && !storage.localOnly)) return storage;
    return this.storageRepository.update(storage.id, { videoCompletedAt: null, localOnly: false });
  }

  async releaseClaims(
    sourceId: number,
    where: { ownerKey?: string; kind?: ClaimKind; path?: string } = {}
  ): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (storage) await this.storageFiles.deleteClaims(storage.id, where);
  }

  async getLiveClaims(sourceId: number): Promise<StorageFileClaim[]> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    return storage ? this.storageFiles.findLiveClaims(storage.id) : [];
  }

  /** Paths with at least one live claim. */
  async getClaimedPaths(sourceId: number): Promise<string[]> {
    return [...new Set((await this.getLiveClaims(sourceId)).map(claim => claim.path))];
  }

  /** Subtitle sidecars follow the retention of the video they belong to. */
  async copyClaims(sourceId: number, fromPath: string, toPaths: string[]): Promise<void> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (storage) await this.storageFiles.copyClaims(storage.id, fromPath, toPaths);
  }

  /** Drop expired claims (or every claim of a kind); returns the source ids whose claims changed. */
  async deleteClaims(where: { expiredAt?: Date; kind?: ClaimKind }): Promise<number[]> {
    const storageIds = await this.storageFiles.deleteClaimsWhere(where);
    const storages = await Promise.all(storageIds.map(id => this.storageRepository.findById(id)));
    return storages.flatMap(storage => (storage ? [storage.sourceId] : []));
  }

  /** Sources wanted only speculatively; they yield bandwidth to active playback. */
  getSpeculativeSourceIds(): Promise<number[]> {
    return this.storageFiles.findSpeculativeSourceIds();
  }

  async markVideoComplete(
    sourceId: number,
    encryptedLayout: EncryptedStorageLayout
  ): Promise<Storage | null> {
    return this.withSourceLock(sourceId, async () => {
      const storage = await this.storageRepository.findBySourceId(sourceId);
      if (!storage) return null;
      if (storage.videoCompletedAt) return storage;
      const completed = await this.storageRepository.update(storage.id, {
        videoCompletedAt: new Date(),
        encryptedLayout: storage.encryptedLayout ?? encryptedLayout,
      });
      if (completed) await this.markAsAccessed(sourceId);
      return completed;
    });
  }

  async detachCompletedStorage(
    sourceId: number,
    detachTorrent: () => Promise<void>
  ): Promise<Storage | null> {
    return this.withSourceLock(sourceId, async () => {
      const storage = await this.storageRepository.findBySourceId(sourceId);
      if (!storage || storage.localOnly) return storage;
      await detachTorrent();
      return this.storageRepository.update(storage.id, { localOnly: true });
    });
  }

  /**
   * Get storage information by storage ID
   */
  @traced('StorageService')
  async getStorageById(id: number): Promise<Storage | null> {
    return this.storageRepository.findById(id);
  }

  /**
   * Remove storage record and associated data
   * Emits 'delete' event
   */
  @traced('StorageService')
  async removeStorage(sourceId: number): Promise<number> {
    const result = await this.removeStorageWithResult(sourceId);
    return result.status === 'removed' ? result.bytes : 0;
  }

  async removeStorageWithResult(sourceId: number): Promise<StorageRemovalResult> {
    return this.withSourceLock(sourceId, () => this.removeStorageLocked(sourceId));
  }

  private async removeStorageLocked(sourceId: number): Promise<StorageRemovalResult> {
    const storage = await this.storageRepository.findBySourceIdWithRelation(sourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${sourceId}`);
      return { status: 'not_found' };
    }

    if ((storage.activeStreams ?? 0) > 0) {
      logger.warn('StorageService', `Refusing to remove active storage for source ${sourceId}`);
      return { status: 'active_playback' };
    }

    try {
      await Promise.all(this.deleteHandlers.map(handler => handler(storage)));
    } catch (error) {
      logger.warn(
        'StorageService',
        `Physical cleanup failed for movie source ${sourceId}; keeping the database record`,
        error
      );
      return { status: 'cleanup_failed' };
    }

    const success = await this.storageRepository.deleteBySourceId(sourceId);

    if (success) {
      (storage as Storage & { physicalCleanupDone?: boolean }).physicalCleanupDone = true;
      logger.info(
        'StorageService',
        `Removed storage record for movie source ${sourceId} at ${storage.location}`
      );
      this.emit('delete', storage);
    }

    return success ? { status: 'removed', bytes: storage.size } : { status: 'cleanup_failed' };
  }

  /**
   * Free the files of one storage that `maxClaimRank` allows to go: files whose strongest live
   * claim ranks at most that (unclaimed files rank 0) and that hold data. Files with stronger
   * claims stay and keep downloading. The whole storage is removed only when no file is left
   * with a stronger claim. A file whose boundary piece is shared with a neighbor takes that piece
   * with it, so a kept neighbor is marked incomplete and refetches just that piece; a neighbor
   * under a live playback claim blocks the reclaim instead.
   */
  async reclaimFiles(
    sourceId: number,
    maxClaimRank: number,
    allowRemoval = true
  ): Promise<StorageReclaimResult> {
    const { result, reselect } = await this.reclaimFilesDeferred(
      sourceId,
      maxClaimRank,
      allowRemoval
    );
    if (reselect) await this.reselectQuietly(reselect);
    return result;
  }

  /**
   * Reclaim under the source lock but leave the reselect to the caller, which must run it outside
   * the admission queue: reselect may attach a torrent (network) and takes source locks.
   */
  private async reclaimFilesDeferred(
    sourceId: number,
    maxClaimRank: number,
    allowRemoval: boolean
  ): Promise<{ result: StorageReclaimResult; reselect: Storage | null }> {
    let reselect: Storage | null = null;
    const result = await this.withSourceLock<StorageReclaimResult>(sourceId, async () => {
      const storage = await this.storageRepository.findBySourceIdWithRelation(sourceId);
      if (!storage) return { status: 'not_found' };
      if ((storage.activeStreams ?? 0) > 0) return { status: 'active_playback' };

      const plan = await this.planReclaim(storage, maxClaimRank);
      if (!plan.kept.length) {
        if (!allowRemoval) return { status: 'kept_last' };
        return this.removeStorageLocked(sourceId);
      }
      const handler = this.reclaimHandler;
      if (!plan.reclaim.length || !handler) return { status: 'nothing' };

      const chargeBefore = Math.max(storage.allocatedBytes ?? 0, storage.reservedBytes ?? 0);
      let failed = false;
      try {
        // Drop the weak claims first so nothing reselects these files while they are removed.
        for (const path of plan.reclaim) await this.storageFiles.deleteClaims(storage.id, { path });
        const live = await handler.reclaim(storage, plan.reclaim, plan.pieces);
        await this.commitReclaim(storage, plan, live ?? storage.downloadedPieces);
      } catch (error) {
        failed = true;
        logger.warn(
          'StorageService',
          `Physical reclaim failed for source ${sourceId}; marking its files as possibly missing`,
          error
        );
        await this.markReclaimUncertain(storage, plan).catch(markError =>
          logger.warn(
            'StorageService',
            `Could not record the failed reclaim of source ${sourceId}`,
            markError
          )
        );
      }

      // Claimed files must be reselected whether or not the reclaim went through.
      reselect = await this.storageRepository.findBySourceIdWithRelation(sourceId);
      if (failed) return { status: 'cleanup_failed' };
      const chargeAfter = reselect
        ? Math.max(reselect.allocatedBytes ?? 0, reselect.reservedBytes ?? 0)
        : 0;
      logger.info(
        'StorageService',
        `Reclaimed ${plan.reclaim.length} file(s) of source ${sourceId}, kept ${plan.kept.length}`
      );
      return { status: 'reclaimed', bytes: Math.max(0, chargeBefore - chargeAfter) };
    });
    return { result, reselect };
  }

  private async reselectQuietly(storage: Storage): Promise<void> {
    await this.reclaimHandler
      ?.reselect(storage)
      .catch(error =>
        logger.warn(
          'StorageService',
          `Could not reselect source ${storage.sourceId} after reclaim`,
          error
        )
      );
  }

  /** Run reselects collected during admission once the admission queue is free, unawaited. */
  private reselectAfterAdmission(pending: Storage[]): void {
    for (const storage of pending) void this.reselectQuietly(storage);
  }

  /** Split a storage's files into those that stay (stronger claim) and those holding data to free. */
  private async planReclaim(storage: Storage, maxClaimRank: number) {
    const layout = storage.encryptedLayout;
    const rank = new Map<string, number>();
    for (const claim of await this.storageFiles.findLiveClaims(storage.id)) {
      rank.set(claim.path, Math.max(rank.get(claim.path) ?? 0, CLAIM_RANK[claim.kind]));
    }
    const rows = new Map(
      (await this.storageFiles.findFiles(storage.id)).map(file => [file.path, file])
    );
    const geometry = new Map<string, { offset: number; length: number }>();
    for (const file of layout?.files ?? []) geometry.set(file.path, file);
    for (const file of rows.values()) if (!geometry.has(file.path)) geometry.set(file.path, file);
    const rangeOf = (path: string) => {
      const file = geometry.get(path);
      return file && layout ? pieceRangeOf(layout.pieceLength, file.offset, file.length) : null;
    };

    // Once the files are known, a claim on a path the source does not contain has no data and
    // must not keep the rest. Before that (admission just claimed a path) every claim counts.
    const paths = new Set(geometry.size ? geometry.keys() : rank.keys());
    const kept = [...paths].filter(path => (rank.get(path) ?? 0) > maxClaimRank);
    const keptRanges = kept.flatMap(path => rangeOf(path) ?? []);
    const overlaps = (a: PieceRange, b: PieceRange) => a.first <= b.last && b.first <= a.last;
    const playingRanges = kept
      .filter(path => (rank.get(path) ?? 0) >= CLAIM_RANK.playback)
      .flatMap(path => rangeOf(path) ?? []);

    // Data a file owns alone: a piece shared only with a kept neighbor is the neighbor's to keep.
    const holdsData = (path: string) => {
      const complete = Boolean(rows.get(path)?.completedAt);
      const range = rangeOf(path);
      if (!range || !layout) return complete;
      for (let piece = range.first; piece <= range.last; piece++) {
        if (
          (complete || isPieceInBitfield(storage.downloadedPieces, piece)) &&
          !keptRanges.some(kept => kept.first <= piece && piece <= kept.last)
        )
          return true;
      }
      return false;
    };

    const reclaim: string[] = [];
    const pieces: PieceRange[] = [];
    for (const path of paths) {
      if (kept.includes(path) || !holdsData(path)) continue;
      const range = rangeOf(path);
      if (range && playingRanges.some(playing => overlaps(range, playing))) continue;
      reclaim.push(path);
      if (range) pieces.push(range);
    }
    return { kept, reclaim, pieces, rangeOf, rows };
  }

  /** Persist a reclaim: bitfield, per-file completion, accounting and the source's open state. */
  private async commitReclaim(
    storage: Storage,
    plan: Awaited<ReturnType<StorageService['planReclaim']>>,
    liveBitfield: Uint8Array
  ): Promise<void> {
    const layout = storage.encryptedLayout;
    const bitfield = clearPiecesInBitfield(liveBitfield, plan.pieces);
    const packBytes = layout?.files.reduce((total, file) => total + file.length, 0) ?? 0;
    const totalPieces =
      storage.totalPieces || (layout ? Math.ceil(packBytes / layout.pieceLength) : 0);
    const downloaded = totalPieces
      ? await this.calculateProgressFromBitfield(bitfield, totalPieces)
      : 0;

    // Kept neighbors that lost a boundary piece are no longer complete.
    const lostPieces = (path: string) => {
      const range = plan.rangeOf(path);
      return Boolean(
        range && plan.pieces.some(p => p.first <= range.last && range.first <= p.last)
      );
    };
    const neighbors = plan.kept.filter(
      path => plan.rows.get(path)?.completedAt && lostPieces(path)
    );
    await this.storageFiles.clearFilesComplete(storage.id, [...plan.reclaim, ...neighbors]);

    const stillComplete = (path: string) =>
      !neighbors.includes(path) &&
      (Boolean(plan.rows.get(path)?.completedAt) ||
        Boolean(layout && isFileCompleteInBitfield(layout, path, bitfield)));
    const reopen = plan.kept.some(
      path => layout?.files.some(file => file.path === path) && !stillComplete(path)
    );

    const keptFiles = layout?.files.filter(file => plan.kept.includes(file.path)) ?? [];
    const keptBytes = keptFiles.reduce((total, file) => total + file.length, 0);
    const estimate = layout
      ? Math.min(packBytes, keptBytes + layout.pieceLength * 2 * keptFiles.length)
      : storage.reservedBytes;
    await this.storageRepository.update(storage.id, {
      downloadedPieces: bitfield,
      downloaded,
      logicalBytes: layout ? keptBytes : storage.logicalBytes,
      verifiedBytes: Math.min(storage.size, Math.round((downloaded / 10000) * storage.size)),
      reservedBytes: Math.min(storage.reservedBytes ?? 0, estimate),
      ...(reopen ? { videoCompletedAt: null, localOnly: false } : {}),
    });
    await this.reconcileAllocation(storage.sourceId);
  }

  /**
   * A reclaim failed after it started deleting: the files may be partly gone. Record the planned
   * pieces and files as missing rather than claim data that may not be there; a kept neighbor
   * that shared a piece with them refetches it.
   */
  private async markReclaimUncertain(
    storage: Storage,
    plan: Awaited<ReturnType<StorageService['planReclaim']>>
  ): Promise<void> {
    const current = (await this.storageRepository.findById(storage.id)) ?? storage;
    const bitfield = clearPiecesInBitfield(
      current.downloadedPieces ?? new Uint8Array(0),
      plan.pieces
    );
    const totalPieces = current.totalPieces || storage.totalPieces;
    const downloaded = totalPieces
      ? await this.calculateProgressFromBitfield(bitfield, totalPieces)
      : 0;
    const neighbors = plan.kept.filter(path => {
      const range = plan.rangeOf(path);
      return Boolean(
        range && plan.pieces.some(p => p.first <= range.last && range.first <= p.last)
      );
    });
    await this.storageFiles.clearFilesComplete(storage.id, [...plan.reclaim, ...neighbors]);
    await this.storageRepository.update(storage.id, {
      downloadedPieces: bitfield,
      downloaded,
      ...(neighbors.length ? { videoCompletedAt: null, localOnly: false } : {}),
    });
  }

  async getInventory(): Promise<StorageInventory> {
    const storages = await this.storageRepository.findAllWithSourceAndMovie();
    const claimed = new Map<number, Set<string>>();
    for (const claim of await this.storageFiles.findLiveClaims()) {
      const paths = claimed.get(claim.storageId) ?? new Set<string>();
      paths.add(claim.path);
      claimed.set(claim.storageId, paths);
    }
    const items = storages.map(storage =>
      Object.assign(storage, { requestedFiles: [...(claimed.get(storage.id) ?? [])] })
    );

    let filesystem: { totalBytes: number; freeBytes: number } | null = null;
    try {
      const result = await statfs(this.config.getOrThrow('DOWNLOAD_PATH'));
      filesystem = {
        totalBytes: Number(BigInt(result.blocks) * BigInt(result.bsize)),
        freeBytes: Number(BigInt(result.bavail) * BigInt(result.bsize)),
      };
    } catch {
      filesystem = null;
    }

    return {
      items,
      physicalBytes: items.reduce((sum, storage) => sum + (storage.allocatedBytes ?? 0), 0),
      storageBudgetBytes: Number(this.maxStorageBytes),
      reservedBytes: Number(await this.storageRepository.getTotalReservedStorageUsage()),
      chargedBytes: Number(await this.storageRepository.getChargedStorageUsage()),
      filesystem,
    };
  }

  /**
   * Get total storage usage in bytes
   */
  @traced('StorageService')
  async getTotalStorageUsage(): Promise<bigint> {
    return this.storageRepository.getTotalStorageUsage();
  }

  async getChargedStorageUsage(): Promise<bigint> {
    return this.storageRepository.getChargedStorageUsage();
  }

  getAllocationMode(): AllocationMode {
    return this.allocationMode;
  }

  async reconcileAllocation(sourceId: number): Promise<Storage | null> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) return null;
    const allocatedBytes = await this.measureAllocatedBytes(storage.location);
    if (allocatedBytes === null) return storage;
    await this.storageRepository.reconcileAllocation(storage.id, allocatedBytes);
    return this.storageRepository.findBySourceId(sourceId);
  }

  async setPlaybackActive(sourceId: number, active: boolean): Promise<boolean> {
    const storage = await this.storageRepository.findBySourceId(sourceId);
    if (!storage) return false;
    return this.storageRepository.changeActiveStreams(storage.id, active ? 1 : -1);
  }

  /** Serialize a source's stream startup against cleanup and removal. */
  async withSourceLock<T>(sourceId: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.sourceTails.get(sourceId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => (release = resolve));
    this.sourceTails.set(sourceId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.sourceTails.get(sourceId) === current) this.sourceTails.delete(sourceId);
    }
  }

  /** Increase a row's reservation; speculative requests keep the playback reserve free. */
  async reserveStorage(sourceId: number, bytes: number, speculative = false): Promise<void> {
    const reselects: Storage[] = [];
    try {
      await this.withAdmission(async () => {
        const storage = await this.storageRepository.findBySourceId(sourceId);
        if (!storage) throw new Error(`Storage not found for movie source ${sourceId}`);
        const requested = Math.max(0, Math.floor(bytes));
        const nextReservation = Math.max(storage.reservedBytes ?? 0, requested);
        const currentCharge = Math.max(storage.allocatedBytes ?? 0, storage.reservedBytes ?? 0);
        const nextCharge = Math.max(storage.allocatedBytes ?? 0, nextReservation);
        const delta = nextCharge - currentCharge;
        if (delta > 0) {
          await this.cleanupWithinAdmission(
            true,
            delta,
            sourceId,
            speculative,
            speculative ? SPECULATIVE_EVICTION_RANK : RETAINED_EVICTION_RANK,
            reselects
          );
          await this.assertCapacity(delta, speculative);
        }
        await this.storageRepository.update(storage.id, {
          reservedBytes: nextReservation,
          lastInterestAt: new Date(),
        });
      });
    } finally {
      this.reselectAfterAdmission(reselects);
    }
  }

  private async withAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.admissionTail.then(operation);
    this.admissionTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async assertCapacity(bytes: number, preservePlaybackReserve = false): Promise<void> {
    const charged = await this.storageRepository.getChargedStorageUsage();
    const reserve = preservePlaybackReserve ? this.playbackReserveBytes : 0n;
    if (charged + BigInt(bytes) + reserve > this.maxStorageBytes) {
      throw new Error('Insufficient storage capacity');
    }

    try {
      const downloadPath = this.config.getOrThrow('DOWNLOAD_PATH');
      const filesystem = await statfs(downloadPath);
      const filesystemReserve = 256n * 1024n * 1024n + reserve;
      if (
        BigInt(filesystem.bavail) * BigInt(filesystem.bsize) <
        BigInt(bytes) + filesystemReserve
      ) {
        throw new Error('Insufficient filesystem capacity');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Insufficient')) throw error;
      // A failed probe is conservative: application threshold still applies,
      // and the backing store will be reconciled after it is opened.
    }
  }

  private async probeAllocationMode(): Promise<void> {
    let probePath: string | undefined;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const downloadPath = this.config.getOrThrow('DOWNLOAD_PATH');
      await mkdir(downloadPath, { recursive: true });
      probePath = `${downloadPath}/.allocation-probe-${randomUUID()}`;
      const logicalSize = 64 * 1024 * 1024;
      handle = await open(probePath, 'w+');
      await handle.truncate(logicalSize);
      const block = Buffer.alloc(4096);
      await handle.write(block, 0, block.length, 0);
      await handle.write(block, 0, block.length, logicalSize - block.length);
      const measured = await stat(probePath);
      const allocated = measured.blocks > 0 ? measured.blocks * 512 : measured.size;
      this.allocationMode = allocated < logicalSize / 2 ? 'sparse' : 'full';
    } catch {
      this.allocationMode = 'unknown';
    } finally {
      await handle?.close().catch(() => undefined);
      if (probePath) await unlink(probePath).catch(() => undefined);
    }
  }

  private async measureAllocatedBytes(location: string): Promise<number | null> {
    const visit = async (path: string, isRoot: boolean): Promise<number | null> => {
      let entry;
      try {
        entry = await stat(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        if (isRoot) throw error;
        return null;
      }
      if (!entry.isDirectory()) {
        return entry.blocks > 0 ? entry.blocks * 512 : entry.size;
      }
      const children = await readdir(path);
      const sizes = await Promise.all(children.map(child => visit(`${path}/${child}`, false)));
      if (sizes.some(size => size === null)) return null;
      return (sizes as number[]).reduce((sum, value) => sum + value, 0);
    };
    return visit(location, true);
  }

  /**
   * Find storage records that haven't been accessed recently
   * Useful for cleanup operations
   */
  @traced('StorageService')
  async findStaleStorage(daysSinceLastAccess: number, limit?: number): Promise<Storage[]> {
    return this.storageRepository.findOldUnaccessed(daysSinceLastAccess, limit);
  }

  /**
   * Get storage records with completed downloads (100% progress)
   */
  @traced('StorageService')
  async getCompletedDownloads(): Promise<Storage[]> {
    return this.storageRepository.findByDownloadedRange(10000, 10000);
  }

  /**
   * Get storage records currently downloading (0% < progress < 100%)
   */
  @traced('StorageService')
  async getActiveDownloads(): Promise<Storage[]> {
    return this.storageRepository.findByDownloadedRange(1, 9999);
  }

  /**
   * Validate bitfield data integrity
   */
  @traced('StorageService')
  async validateBitfield(bitfield: Uint8Array, expectedPieces: number): Promise<boolean> {
    const expectedBytes = Math.ceil(expectedPieces / 8);
    return bitfield.length === expectedBytes;
  }

  /**
   * Calculate actual download percentage from bitfield
   */
  @traced('StorageService')
  async calculateProgressFromBitfield(bitfield: Uint8Array, totalPieces: number): Promise<number> {
    if (!Number.isInteger(totalPieces) || totalPieces <= 0) return 0;

    let downloadedPieces = 0;

    for (let byteIndex = 0; byteIndex < bitfield.length; byteIndex++) {
      const byte = bitfield[byteIndex];
      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        const pieceIndex = byteIndex * 8 + bitIndex;
        if (pieceIndex >= totalPieces) break;

        if ((byte & (1 << (7 - bitIndex))) !== 0) {
          downloadedPieces++;
        }
      }
    }

    return Math.round((downloadedPieces / totalPieces) * 10000);
  }

  /**
   * Checks storage pressure and deletes old storage records if needed.
   * Emits 'delete' event for each removed storage record.
   * @param canCleanEverything - If false, avoids deleting the last storage record
   */
  @traced('StorageService')
  async cleanup(canCleanEverything = false): Promise<void> {
    const reselects: Storage[] = [];
    try {
      await this.withAdmission(() =>
        this.cleanupWithinAdmission(canCleanEverything, 0, undefined, false, 0, reselects)
      );
    } finally {
      this.reselectAfterAdmission(reselects);
    }
  }

  /**
   * Free storage, least protected first, until the request fits: file by file where a storage also
   * holds stronger claims, whole storage once nothing stronger is left. `maxClaimRank` bounds
   * which files may go: 0 only unclaimed files, higher ranks also files whose strongest live
   * claim is that weak (see CLAIM_RANK). Live playback claims and active streams are never evicted.
   */
  private async cleanupWithinAdmission(
    canCleanEverything: boolean,
    additionalBytes: number,
    excludeSourceId: number | undefined,
    preservePlaybackReserve: boolean,
    maxClaimRank: number,
    reselects: Storage[]
  ): Promise<void> {
    let currentUsage = await this.storageRepository.getChargedStorageUsage();
    const requested = BigInt(additionalBytes);
    const reserve = preservePlaybackReserve ? this.playbackReserveBytes : 0n;
    if (requested > this.maxStorageBytes) throw new Error('Insufficient storage capacity');
    if (currentUsage + requested + reserve <= this.maxStorageBytes) {
      return; // No cleanup needed
    }

    logger.warn(
      'StorageService',
      `Storage pressure detected: ${humanReadableBytes(currentUsage)} used`
    );

    const maxCleanupAttempts = 100; // Safety limit to prevent infinite loops
    let cleanupAttempts = 0;
    let totalCleanedUp = 0n;

    while (
      currentUsage + requested + reserve > this.maxStorageBytes &&
      cleanupAttempts < maxCleanupAttempts
    ) {
      let outcome: StorageReclaimResult | null = null;
      for (const candidateId of await this.storageFiles.findIdleStorageIds(excludeSourceId)) {
        const candidate = await this.storageRepository.findById(candidateId);
        if (!candidate) continue;
        // During periodic cleanup, avoid deleting the last storage record
        const allowRemoval =
          canCleanEverything || (await this.storageRepository.getStorageCount()) > 1;
        const { result, reselect } = await this.reclaimFilesDeferred(
          candidate.sourceId,
          maxClaimRank,
          allowRemoval
        );
        if (reselect) reselects.push(reselect);
        if (['nothing', 'not_found', 'active_playback'].includes(result.status)) continue;
        outcome = result;
        break;
      }
      if (!outcome) {
        logger.warn('StorageService', 'No reclaimable storage found');
        break;
      }
      if (outcome.status === 'kept_last') {
        logger.info(
          'StorageService',
          'Stopping periodic cleanup to avoid deleting the last storage record'
        );
        break;
      }
      if (outcome.status === 'cleanup_failed') {
        logger.warn('StorageService', 'Failed to free the least protected storage');
        // If we can't free this record, we can't continue since it's the most stale
        break;
      }
      if (outcome.status === 'removed' || outcome.status === 'reclaimed') {
        totalCleanedUp += BigInt(outcome.bytes);
        logger.info(
          'StorageService',
          `${outcome.status === 'removed' ? 'Removed' : 'Reclaimed files of'} storage (${humanReadableBytes(outcome.bytes)})`
        );
        // Recalculate current usage to get accurate state
        currentUsage = await this.storageRepository.getChargedStorageUsage();
      }

      cleanupAttempts++;
    }

    if (cleanupAttempts >= maxCleanupAttempts) {
      logger.error(
        'StorageService',
        `Storage cleanup stopped after ${maxCleanupAttempts} attempts. Current usage: ${humanReadableBytes(currentUsage)}`
      );
    } else if (currentUsage + requested + reserve <= this.maxStorageBytes) {
      logger.info(
        'StorageService',
        `Storage cleanup completed successfully. Cleaned up ${humanReadableBytes(totalCleanedUp)}, current usage: ${humanReadableBytes(currentUsage)}`
      );
    } else {
      logger.warn(
        'StorageService',
        `Storage cleanup completed but usage still exceeds threshold. Cleaned up ${humanReadableBytes(totalCleanedUp)}, current usage: ${humanReadableBytes(currentUsage)}`
      );
    }
  }
}

export type AllocationMode = 'full' | 'sparse' | 'unknown';
