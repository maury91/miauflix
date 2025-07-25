import { logger } from '@logger';
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';

import { ENV } from '@constants';
import type { Database } from '@database/database';
import type { Storage } from '@entities/storage.entity';
import type { StorageRepository } from '@repositories/storage.repository';
import { humanReadableBytes } from '@utils/numbers';

/**
 * Service for tracking and managing storage of downloaded movie sources
 */
export class StorageService extends (EventEmitter as new () => TypedEmitter<{
  delete: (storage: Storage) => void;
}>) {
  private readonly storageRepository: StorageRepository;
  private readonly maxStorageBytes: bigint;

  constructor(db: Database) {
    super();
    this.storageRepository = db.getStorageRepository();
    this.maxStorageBytes = this.calculateMaxStorageBytes();
  }

  private calculateMaxStorageBytes(): bigint {
    // FixMe: Add support for percentage
    return ENV('STORAGE_THRESHOLD');
  }

  /**
   * Create a new storage record for a movie source
   * Checks storage pressure and performs cleanup if needed before creating new storage
   */
  async createStorage(params: {
    movieSourceId: number;
    location: string;
    size: number;
    downloadedPieces?: Uint8Array;
    totalPieces?: number;
  }): Promise<Storage> {
    const { movieSourceId, location, size, downloadedPieces, totalPieces } = params;

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

    // Create empty bitfield if not provided
    const bitfield = downloadedPieces || new Uint8Array(0);

    // Calculate downloaded progress from bitfield if provided
    const downloaded =
      totalPieces && bitfield.length > 0
        ? this.calculateProgressFromBitfield(bitfield, totalPieces)
        : 0;

    const storageData: Partial<Storage> = {
      movieSourceId,
      location,
      size,
      downloadedPieces: bitfield,
      downloaded,
      lastAccessAt: null,
      lastWriteAt: null,
    };

    return this.storageRepository.create(storageData);
  }

  /**
   * Update download progress and bitfield for a storage record
   */
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
    const downloaded = this.calculateProgressFromBitfield(downloadedPieces, totalPieces);

    await this.storageRepository.updateDownloadProgress(
      storage.id,
      downloaded,
      downloadedPieces,
      size
    );

    logger.debug(
      'StorageService',
      `Updated download progress for movie source ${movieSourceId}: ${(downloaded / 100).toFixed(2)}%`
    );
  }

  /**
   * Mark a storage record as accessed
   */
  async markAsAccessed(movieSourceId: number): Promise<void> {
    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${movieSourceId}`);
      return;
    }

    await this.storageRepository.updateLastAccess(storage.id);

    logger.debug('StorageService', `Updated last access time for storage ${storage.id}`);
  }

  /**
   * Get storage information for a movie source
   */
  async getStorageByMovieSource(movieSourceId: number): Promise<Storage | null> {
    return this.storageRepository.findByMovieSourceId(movieSourceId);
  }

  /**
   * Get storage information by storage ID
   */
  async getStorageById(id: number): Promise<Storage | null> {
    return this.storageRepository.findById(id);
  }

  /**
   * Remove storage record and associated data
   * Emits 'delete' event
   */
  async removeStorage(movieSourceId: number): Promise<number> {
    const storage = await this.storageRepository.findByMovieSourceIdWithRelation(movieSourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${movieSourceId}`);
      return 0;
    }

    const success = await this.storageRepository.deleteByMovieSourceId(movieSourceId);

    if (success) {
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
  async getTotalStorageUsage(): Promise<bigint> {
    return this.storageRepository.getTotalStorageUsage();
  }

  /**
   * Find storage records that haven't been accessed recently
   * Useful for cleanup operations
   */
  async findStaleStorage(daysSinceLastAccess: number, limit?: number): Promise<Storage[]> {
    return this.storageRepository.findOldUnaccessed(daysSinceLastAccess, limit);
  }

  /**
   * Get storage records with completed downloads (100% progress)
   */
  async getCompletedDownloads(): Promise<Storage[]> {
    return this.storageRepository.findByDownloadedRange(10000, 10000);
  }

  /**
   * Get storage records currently downloading (0% < progress < 100%)
   */
  async getActiveDownloads(): Promise<Storage[]> {
    return this.storageRepository.findByDownloadedRange(1, 9999);
  }

  /**
   * Validate bitfield data integrity
   */
  validateBitfield(bitfield: Uint8Array, expectedPieces: number): boolean {
    const expectedBytes = Math.ceil(expectedPieces / 8);
    return bitfield.length === expectedBytes;
  }

  /**
   * Calculate actual download percentage from bitfield
   */
  calculateProgressFromBitfield(bitfield: Uint8Array, totalPieces: number): number {
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
