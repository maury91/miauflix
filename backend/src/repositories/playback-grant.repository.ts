import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { PlaybackGrant } from '@entities/playback-grant.entity';

export class PlaybackGrantRepository {
  private readonly repository: Repository<PlaybackGrant>;

  constructor(db: Database) {
    this.repository = db.getRepository(PlaybackGrant);
  }

  async create(
    grant: Pick<
      PlaybackGrant,
      'expiresAt' | 'keyHash' | 'playableKey' | 'playableKind' | 'sourceId' | 'userId'
    >
  ): Promise<PlaybackGrant> {
    return this.repository.save(this.repository.create(grant));
  }

  async findActiveByHash(keyHash: string, now = new Date()): Promise<PlaybackGrant | null> {
    return this.repository
      .createQueryBuilder('grant')
      .where('grant.keyHash = :keyHash', { keyHash })
      .andWhere('grant.expiresAt > :now', { now })
      .getOne();
  }
}
