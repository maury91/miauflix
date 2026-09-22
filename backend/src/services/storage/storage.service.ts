import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, stat, statfs, unlink } from 'node:fs/promises';

import { logger } from '@logger';
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';

import type { Database } from '@database/database';
import type { Storage } from '@entities/storage.entity';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { StorageRepository } from '@repositories/storage.repository';
import { humanReadableBytes } from '@utils/numbers';
import { traced } from '@utils/tracing.util';

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
  private maxStorageBytes: bigint;
  private readonly config: ConfigService;
  private admissionTail: Promise<void> = Promise.resolve();
  private allocationMode: AllocationMode = 'unknown';
  private readonly deleteHandlers: Array<(storage: Storage) => Promise<void> | void> = [];

  constructor(db: Database, config: ConfigService) {
    super();
    this.config = config;
    this.storageRepository = db.getStorageRepository();
    this.maxStorageBytes = config.getOrThrow('STORAGE_THRESHOLD');
    config.registerService('STORAGE', this);
    void this.probeAllocationMode();
  }

  testable = false;
  async reload(): Promise<void> {
    this.maxStorageBytes = this.config.getOrThrow('STORAGE_THRESHOLD');
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
    movieSourceId: number;
    location: string;
    size: number;
    downloadedPieces?: Uint8Array;
    totalPieces?: number;
    pieceLength?: number;
    retentionClass?: 'speculative' | 'watched';
    reservedBytes?: number;
    speculativeExpiresAt?: Date | null;
  }): Promise<Storage> {
    const {
      movieSourceId,
      location,
      size,
      downloadedPieces,
      totalPieces,
      pieceLength,
      retentionClass = 'watched',
      reservedBytes = 0,
      speculativeExpiresAt = null,
    } = params;
    const reservation =
      reservedBytes > 0 && this.allocationMode !== 'sparse'
        ? Math.max(reservedBytes, size)
        : reservedBytes;

    // If a storage record already exists for this movieSourceId, return it
    const existing = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (existing) {
      logger.debug(
        'StorageService',
        `Storage record already exists for movie source ${movieSourceId}, returning existing record.`
      );
      return existing;
    }

    // Cleanup before creating new storage
    await this.cleanup(true);
    if (reservation > 0) await this.assertAdmission(reservation);

    // Create empty bitfield if not provided
    const bitfield = downloadedPieces || new Uint8Array(0);

    // Calculate downloaded progress from bitfield if provided
    const downloaded =
      totalPieces && bitfield.length > 0
        ? await this.calculateProgressFromBitfield(bitfield, totalPieces)
        : 0;

    const storageData: Partial<Storage> = {
      movieSourceId,
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
      retentionClass,
      lastInterestAt: new Date(),
      speculativeExpiresAt,
      activeStreams: 0,
      lastAccessAt: null,
      lastWriteAt: null,
    };

    return this.storageRepository.create(storageData);
  }

  /**
   * Update download progress and bitfield for a storage record
   */
  @traced('StorageService')
  async updateDownloadProgress(params: {
    movieSourceId: number;
    downloadedPieces: Uint8Array;
    totalPieces: number;
    size?: number;
  }): Promise<void> {
    const { movieSourceId, downloadedPieces, totalPieces, size } = params;

    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${movieSourceId}`);
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
      allocatedBytes: storage.allocatedBytes ?? 0,
      reservedBytes: storage.reservedBytes ?? 0,
    });

    logger.debug(
      'StorageService',
      `Updated download progress for movie source ${movieSourceId}: ${(downloaded / 100).toFixed(2)}%`
    );
  }

  async updateTorrentLayout(
    movieSourceId: number,
    totalPieces: number,
    pieceLength: number,
    logicalBytes: number
  ): Promise<void> {
    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) return;
    await this.storageRepository.update(storage.id, {
      totalPieces,
      pieceLength,
      logicalBytes,
      size: logicalBytes,
    });
  }

  /**
   * Mark a storage record as accessed
   */
  @traced('StorageService')
  async markAsAccessed(movieSourceId: number): Promise<void> {
    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${movieSourceId}`);
      return;
    }

    await this.storageRepository.update(storage.id, {
      lastInterestAt: new Date(),
      retentionClass: 'watched',
      speculativeExpiresAt: null,
    });
    await this.storageRepository.updateLastAccess(storage.id);

    logger.debug('StorageService', `Updated last access time for storage ${storage.id}`);
  }

  /**
   * Get storage information for a movie source
   */
  @traced('StorageService')
  async getStorageByMovieSource(movieSourceId: number): Promise<Storage | null> {
    return this.storageRepository.findByMovieSourceId(movieSourceId);
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
  async removeStorage(movieSourceId: number): Promise<number> {
    const storage = await this.storageRepository.findByMovieSourceIdWithRelation(movieSourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${movieSourceId}`);
      return 0;
    }

    if ((storage.activeStreams ?? 0) > 0) {
      logger.warn(
        'StorageService',
        `Refusing to remove active storage for source ${movieSourceId}`
      );
      return 0;
    }

    try {
      await Promise.all(this.deleteHandlers.map(handler => handler(storage)));
    } catch (error) {
      logger.warn(
        'StorageService',
        `Physical cleanup failed for movie source ${movieSourceId}; keeping the database record`,
        error
      );
      return 0;
    }

    const success = await this.storageRepository.deleteByMovieSourceId(movieSourceId);

    if (success) {
      (storage as Storage & { physicalCleanupDone?: boolean }).physicalCleanupDone = true;
      logger.info(
        'StorageService',
        `Removed storage record for movie source ${movieSourceId} at ${storage.location}`
      );
      this.emit('delete', storage);
    }

    return success ? storage.size : 0;
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

  async reconcileAllocation(movieSourceId: number): Promise<Storage | null> {
    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) return null;
    const allocatedBytes = await this.measureAllocatedBytes(storage.location);
    await this.storageRepository.updateAccounting(storage.id, {
      logicalBytes: storage.logicalBytes || storage.size,
      verifiedBytes: storage.verifiedBytes || 0,
      allocatedBytes,
      reservedBytes: 0,
    });
    return this.storageRepository.findByMovieSourceId(movieSourceId);
  }

  async setPlaybackActive(movieSourceId: number, active: boolean): Promise<boolean> {
    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) return false;
    const activeStreams = Math.max(0, (storage.activeStreams ?? 0) + (active ? 1 : -1));
    await this.storageRepository.update(storage.id, { activeStreams, lastInterestAt: new Date() });
    return true;
  }

  private async assertAdmission(bytes: number): Promise<void> {
    const run = this.admissionTail.then(async () => {
      const charged = await this.storageRepository.getChargedStorageUsage();
      if (charged + BigInt(bytes) > this.maxStorageBytes) {
        throw new Error('Insufficient storage capacity');
      }

      try {
        const downloadPath = this.config.getOrThrow('DOWNLOAD_PATH');
        const filesystem = await statfs(downloadPath);
        const reserve = 256n * 1024n * 1024n;
        if (BigInt(filesystem.bavail) * BigInt(filesystem.bsize) < BigInt(bytes) + reserve) {
          throw new Error('Insufficient filesystem capacity');
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Insufficient')) throw error;
        // A failed probe is conservative: application threshold still applies,
        // and the backing store will be reconciled after it is opened.
      }
    });
    this.admissionTail = run.then(
      () => undefined,
      () => undefined
    );
    await run;
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

  private async measureAllocatedBytes(location: string): Promise<number> {
    const visit = async (path: string): Promise<number> => {
      let entry;
      try {
        entry = await stat(path);
      } catch {
        return 0;
      }
      if (!entry.isDirectory()) {
        return entry.blocks > 0 ? entry.blocks * 512 : entry.size;
      }
      const children = await readdir(path);
      const sizes = await Promise.all(children.map(child => visit(`${path}/${child}`)));
      return sizes.reduce((sum, value) => sum + value, 0);
    };
    return visit(location);
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
    if (totalPieces === 0) return 0;

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
    let currentUsage = await this.storageRepository.getTotalStorageUsage();
    if (currentUsage <= this.maxStorageBytes) {
      return; // No cleanup needed
    }

    logger.warn(
      'StorageService',
      `Storage pressure detected: ${humanReadableBytes(currentUsage)} used`
    );

    const maxCleanupAttempts = 100; // Safety limit to prevent infinite loops
    let cleanupAttempts = 0;
    let totalCleanedUp = 0n;

    while (currentUsage > this.maxStorageBytes && cleanupAttempts < maxCleanupAttempts) {
      const removalCandidate = await this.storageRepository.findMostStaleStorage();
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

      const removedSize = await this.removeStorage(removalCandidate.movieSourceId);

      if (removedSize > 0) {
        totalCleanedUp += BigInt(removedSize);
        logger.info(
          'StorageService',
          `Removed storage record for movie source ${removalCandidate.movieSourceId} (${humanReadableBytes(removedSize)})`
        );

        // Recalculate current usage to get accurate state
        currentUsage = await this.storageRepository.getTotalStorageUsage();
      } else {
        logger.warn(
          'StorageService',
          `Failed to remove storage record for movie source ${removalCandidate.movieSourceId}`
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
    } else if (currentUsage <= this.maxStorageBytes) {
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
