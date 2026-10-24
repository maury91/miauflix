import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { Storage } from '@entities/storage.entity';

export class StorageRepository {
  private readonly repository: Repository<Storage>;

  constructor(private readonly database: Database) {
    this.repository = database.getRepository(Storage);
  }

  async findById(id: number): Promise<Storage | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findBySourceId(sourceId: number): Promise<Storage | null> {
    return this.repository.findOne({ where: { sourceId } });
  }

  async findBySourceIdWithRelation(sourceId: number): Promise<Storage | null> {
    return this.repository.findOne({
      where: { sourceId },
      relations: ['contentSource'],
    });
  }

  async findAllWithSourceAndMovie(): Promise<Storage[]> {
    return this.repository
      .createQueryBuilder('storage')
      .leftJoinAndSelect('storage.contentSource', 'contentSource')
      .leftJoinAndSelect('contentSource.movies', 'movieSource')
      .leftJoinAndSelect('movieSource.movie', 'movie')
      .orderBy('storage.allocatedBytes', 'DESC')
      .addOrderBy('storage.reservedBytes', 'DESC')
      .addOrderBy('movie.title', 'ASC')
      .getMany();
  }

  async findStoragesWithCompletion(): Promise<Storage[]> {
    return this.repository
      .createQueryBuilder('storage')
      .leftJoinAndSelect('storage.contentSource', 'contentSource')
      .where('storage.videoCompletedAt IS NOT NULL')
      .getMany();
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

  async deleteBySourceId(sourceId: number): Promise<boolean> {
    const result = await this.repository.delete({ sourceId });
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

  async updateAccounting(
    id: number,
    accounting: Partial<Pick<Storage, 'logicalBytes' | 'verifiedBytes'>>
  ): Promise<void> {
    await this.repository.update(id, accounting);
  }

  async reconcileAllocation(id: number, allocatedBytes: number): Promise<void> {
    await this.database.write(() =>
      this.repository
        .createQueryBuilder()
        .update(Storage)
        .set({
          allocatedBytes,
          reservedBytes: () =>
            'CASE WHEN :measuredAllocatedBytes >= reservedBytes THEN 0 ELSE reservedBytes END',
        })
        .where('id = :id', { id })
        .setParameter('measuredAllocatedBytes', allocatedBytes)
        .execute()
    );
  }

  async changeActiveStreams(id: number, delta: -1 | 1): Promise<boolean> {
    const expression =
      delta === 1
        ? 'activeStreams + 1'
        : 'CASE WHEN activeStreams > 0 THEN activeStreams - 1 ELSE 0 END';
    const result = await this.database.write(() =>
      this.repository
        .createQueryBuilder()
        .update(Storage)
        .set({ activeStreams: () => expression, lastInterestAt: new Date() })
        .where('id = :id', { id })
        .execute()
    );
    return (result.affected ?? 0) > 0;
  }

  async resetActiveStreams(): Promise<void> {
    await this.database.write(() =>
      this.repository
        .createQueryBuilder()
        .update(Storage)
        .set({ activeStreams: 0 })
        .where('activeStreams > 0')
        .execute()
    );
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
   * Get total count of storage records
   */
  async getStorageCount(): Promise<number> {
    return this.repository.count();
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

  /** Application charge: physical allocation, or the reservation until measured. */
  async getChargedStorageUsage(): Promise<bigint> {
    const result = await this.repository
      .createQueryBuilder('storage')
      .select('SUM(MAX(storage.allocatedBytes, storage.reservedBytes))', 'totalSize')
      .getRawOne<{ totalSize: string }>();

    return BigInt(result?.totalSize || 0);
  }

  async getTotalReservedStorageUsage(): Promise<bigint> {
    const result = await this.repository
      .createQueryBuilder('storage')
      .select('SUM(storage.reservedBytes)', 'totalSize')
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
