import { logger } from '@logger';

import type { Database } from '@database/database';
import type { Storage } from '@entities/storage.entity';
import type { StorageRepository } from '@repositories/storage.repository';

/**
 * Service for tracking and managing storage of downloaded movie sources
 */
export class StorageService {
  private readonly storageRepository: StorageRepository;

  constructor(db: Database) {
    this.storageRepository = db.getStorageRepository();
  }

  /**
   * Create a new storage record for a movie source
   */
  async createStorage(params: {
    movieSourceId: number;
    location: string;
    size: number;
    downloadedPieces?: Uint8Array;
    totalPieces?: number;
  }): Promise<Storage> {
    const { movieSourceId, location, size, downloadedPieces, totalPieces } = params;

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

    const storage = await this.storageRepository.create(storageData);

    logger.debug(
      'StorageService',
      `Created storage record ${storage.id} for movie source ${movieSourceId} at ${location} with ${(downloaded / 100).toFixed(2)}% progress`
    );

    return storage;
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
   */
  async removeStorage(movieSourceId: number): Promise<boolean> {
    const storage = await this.storageRepository.findByMovieSourceId(movieSourceId);
    if (!storage) {
      logger.warn('StorageService', `Storage record not found for movie source ${movieSourceId}`);
      return false;
    }

    const success = await this.storageRepository.deleteByMovieSourceId(movieSourceId);

    if (success) {
      logger.info(
        'StorageService',
        `Removed storage record for movie source ${movieSourceId} at ${storage.location}`
      );
    }

    return success;
  }

  /**
   * Get total storage usage in bytes
   */
  async getTotalStorageUsage(): Promise<number> {
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
}
