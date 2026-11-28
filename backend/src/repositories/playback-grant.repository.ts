import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { PlaybackGrant } from '@entities/playback-grant.entity';

export class PlaybackGrantRepository {
  private readonly repository: Repository<PlaybackGrant>;

  constructor(db: Database) {
    this.repository = db.getRepository(PlaybackGrant);
  }

  async create(
    grant: Partial<Pick<PlaybackGrant, 'matchKind' | 'watchOnce'>> &
      Pick<
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

  /** The still-valid watch-once grant for a playable, used to release storage on completion. */
  async findWatchOnceForCompletion(
    userId: string,
    playableKind: PlaybackGrant['playableKind'],
    playableKey: string,
    now: Date
  ): Promise<PlaybackGrant | null> {
    return this.repository
      .createQueryBuilder('grant')
      .where('grant.userId = :userId', { userId })
      .andWhere('grant.playableKind = :playableKind', { playableKind })
      .andWhere('grant.playableKey = :playableKey', { playableKey })
      .andWhere('grant.watchOnce = :watchOnce', { watchOnce: true })
      .andWhere('grant.expiresAt > :now', { now })
      .getOne();
  }

  /** Another live grant for the same playable means its session may still be streaming. */
  async hasOtherActiveWatchOnceGrants(
    userId: string,
    playableKind: PlaybackGrant['playableKind'],
    playableKey: string,
    excludeId: number,
    now: Date
  ): Promise<boolean> {
    const count = await this.repository
      .createQueryBuilder('grant')
      .where('grant.userId = :userId', { userId })
      .andWhere('grant.playableKind = :playableKind', { playableKind })
      .andWhere('grant.playableKey = :playableKey', { playableKey })
      .andWhere('grant.watchOnce = :watchOnce', { watchOnce: true })
      .andWhere('grant.expiresAt > :now', { now })
      .andWhere('grant.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async deleteById(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}
