import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { Storage } from '@entities/storage.entity';

export class StorageRepository {
  private readonly repository: Repository<Storage>;

  constructor(db: Database) {
    this.repository = db.getRepository(Storage);
  }

  async findById(id: number): Promise<Storage | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByMovieSourceId(movieSourceId: number): Promise<Storage | null> {
    return this.repository.findOne({ where: { movieSourceId } });
  }

  async findByMovieSourceIdWithRelation(movieSourceId: number): Promise<Storage | null> {
    return this.repository.findOne({
      where: { movieSourceId },
      relations: ['movieSource'],
    });
  }

  async create(storage: Partial<Storage>): Promise<Storage> {
    const newStorage = this.repository.create(storage);
    return this.repository.save(newStorage);
  }

  async update(id: number, storage: Partial<Storage>): Promise<Storage | null> {
    await this.repository.update(id, storage);
    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  async deleteByMovieSourceId(movieSourceId: number): Promise<boolean> {
    const result = await this.repository.delete({ movieSourceId });
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Update last access time for a storage record
   */
  async updateLastAccess(id: number): Promise<void> {
    await this.repository.update(id, { lastAccessAt: new Date() });
  }

  /**
   * Update last write time and download progress
   */
  async updateDownloadProgress(
    id: number,
    downloaded: number,
    downloadedPieces: Uint8Array,
    size?: number
  ): Promise<void> {
    const updateData: Partial<Storage> = {
      downloaded,
      downloadedPieces,
      lastWriteAt: new Date(),
    };

    if (size !== undefined) {
      updateData.size = size;
    }

    await this.repository.update(id, updateData);
  }

  /**
   * Find storage records that haven't been accessed recently for cleanup
   */
  async findOldUnaccessed(daysSinceLastAccess: number, limit?: number): Promise<Storage[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastAccess);

    const query = this.repository
      .createQueryBuilder('storage')
      .where('storage.lastAccessAt < :cutoffDate OR storage.lastAccessAt IS NULL', { cutoffDate })
      .orderBy('storage.lastAccessAt', 'ASC');

    if (limit) {
      query.limit(limit);
    }

    return query.getMany();
  }

  /**
   * Get total storage usage in bytes
   */
  async getTotalStorageUsage(): Promise<bigint> {
    const result = await this.repository
      .createQueryBuilder('storage')
      .select('SUM(storage.size)', 'totalSize')
      .getRawOne<{ totalSize: string }>();

    return BigInt(result?.totalSize || 0);
  }

  /**
   * Find storage records by download progress range
   */
  async findByDownloadedRange(minProgress: number, maxProgress: number): Promise<Storage[]> {
    return this.repository
      .createQueryBuilder('storage')
      .where('storage.downloaded >= :minProgress AND storage.downloaded <= :maxProgress', {
        minProgress,
        maxProgress,
      })
      .orderBy('storage.downloaded', 'DESC')
      .getMany();
  }
}
