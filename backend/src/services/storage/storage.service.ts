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

export type StorageRemovalResult =
  | { status: 'active_playback' | 'cleanup_failed' | 'not_found' }
  | { status: 'removed'; bytes: number };

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

    return this.withAdmission(async () => {
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
          speculative ? SPECULATIVE_EVICTION_RANK : RETAINED_EVICTION_RANK
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
    where: { ownerKey?: string; kind?: ClaimKind } = {}
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
          speculative ? SPECULATIVE_EVICTION_RANK : RETAINED_EVICTION_RANK
        );
        await this.assertCapacity(delta, speculative);
      }
      await this.storageRepository.update(storage.id, {
        reservedBytes: nextReservation,
        lastInterestAt: new Date(),
      });
    });
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
    await this.withAdmission(() =>
      this.cleanupWithinAdmission(canCleanEverything, 0, undefined, false, 0)
    );
  }

  /**
   * Evict whole storage, least protected first, until the request fits. `maxClaimRank` bounds
   * which storage may go: 0 only unclaimed storage, higher ranks also storage whose strongest live
   * claim is that weak (see CLAIM_RANK). Live playback claims and active streams are never evicted.
   */
  private async cleanupWithinAdmission(
    canCleanEverything: boolean,
    additionalBytes: number,
    excludeSourceId: number | undefined,
    preservePlaybackReserve: boolean,
    maxClaimRank: number
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
      const candidateId = await this.storageFiles.findEvictionCandidate(
        maxClaimRank,
        excludeSourceId
      );
      const removalCandidate =
        candidateId === null ? null : await this.storageRepository.findById(candidateId);
      if (!removalCandidate) {
        logger.warn('StorageService', 'No storage records found');
        break;
      }

      // During periodic cleanup, avoid deleting the last storage record
      // Get current count each time for maximum accuracy
      if (!canCleanEverything) {
        const currentStorageCount = await this.storageRepository.getStorageCount();
        if (currentStorageCount <= 1) {
          logger.info(
            'StorageService',
            'Stopping periodic cleanup to avoid deleting the last storage record'
          );
          break;
        }
      }

      const removedSize = await this.removeStorage(removalCandidate.sourceId);

      if (removedSize > 0) {
        totalCleanedUp += BigInt(removedSize);
        logger.info(
          'StorageService',
          `Removed storage record for movie source ${removalCandidate.sourceId} (${humanReadableBytes(removedSize)})`
        );

        // Recalculate current usage to get accurate state
        currentUsage = await this.storageRepository.getChargedStorageUsage();
      } else {
        logger.warn(
          'StorageService',
          `Failed to remove storage record for movie source ${removalCandidate.sourceId}`
        );
        // If we can't remove this record, we can't continue since it's the most stale
        break;
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
