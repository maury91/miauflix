import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { StreamingKey } from '@entities/streaming-key.entity';

export class StreamingKeyRepository {
  private readonly streamingKeyRepository: Repository<StreamingKey>;

  constructor(db: Database) {
    this.streamingKeyRepository = db.getRepository(StreamingKey);
  }

  async create(streamingKeyData: {
    keyHash: string;
    movieId: number;
    userId: number;
    expiresAt: Date;
  }): Promise<StreamingKey> {
    const streamingKey = this.streamingKeyRepository.create(streamingKeyData);
    return this.streamingKeyRepository.save(streamingKey);
  }

  async findByKeyHash(keyHash: string): Promise<StreamingKey | null> {
    return this.streamingKeyRepository.findOne({
      where: { keyHash },
      select: {
        movieId: true,
        userId: true,
      },
    });
  }

  async deleteByKeyHash(keyHash: string): Promise<void> {
    await this.streamingKeyRepository.delete({ keyHash });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.streamingKeyRepository
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();

    return result.affected || 0;
  }

  async deleteByUserId(userId: number): Promise<number> {
    const result = await this.streamingKeyRepository.delete({ userId });
    return result.affected || 0;
  }

  async deleteByMovieId(movieId: number): Promise<number> {
    const result = await this.streamingKeyRepository.delete({ movieId });
    return result.affected || 0;
  }
}
