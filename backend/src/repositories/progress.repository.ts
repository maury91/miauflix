import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { Progress } from '@entities/progress.entity';
import type { PlayableRef } from '@routes/playable.types';
import { playableKey } from '@routes/playable.types';

export type ProgressUpdate = Pick<Progress, 'durationSeconds' | 'positionSeconds' | 'state'> & {
  playable: PlayableRef;
};

export class ProgressRepository {
  private readonly progressRepository: Repository<Progress>;

  constructor(database: Database) {
    this.progressRepository = database.getRepository(Progress);
  }

  async upsert(userId: string, update: ProgressUpdate): Promise<Progress> {
    const row = {
      userId,
      playableKind: update.playable.kind,
      playableKey: playableKey(update.playable),
      positionSeconds: update.positionSeconds,
      durationSeconds: update.durationSeconds,
      state: update.state,
      // SQLite upsert does not apply TypeORM's UpdateDateColumn automatically on conflict.
      updatedAt: new Date(),
    } satisfies Partial<Progress>;
    await this.progressRepository.upsert(row, ['userId', 'playableKey']);
    return this.findByKey(userId, row.playableKey) as Promise<Progress>;
  }

  async findByUser(userId: string): Promise<Progress[]> {
    return this.progressRepository.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  async findByKey(userId: string, key: string): Promise<Progress | null> {
    return this.progressRepository.findOne({ where: { userId, playableKey: key } });
  }

  async findUserIdsForMovie(mediaId: number): Promise<string[]> {
    const rows = await this.progressRepository
      .createQueryBuilder('progress')
      .select('DISTINCT progress.userId', 'userId')
      .where('progress.playableKind = :kind', { kind: 'movie' })
      .andWhere('progress.playableKey = :key', { key: `m:${mediaId}` })
      .getRawMany<{ userId: string }>();
    return rows.map(row => row.userId);
  }

  async findUserIdsForShow(showMediaId: number): Promise<string[]> {
    const rows = await this.progressRepository
      .createQueryBuilder('progress')
      .select('DISTINCT progress.userId', 'userId')
      .where('progress.playableKind = :kind', { kind: 'episode' })
      .andWhere('progress.playableKey LIKE :prefix', { prefix: `e:${showMediaId}:%` })
      .getRawMany<{ userId: string }>();
    return rows.map(row => row.userId);
  }

  findEpisodeProgressForShow(showMediaId: number, userIds: string[]): Promise<Progress[]> {
    if (!userIds.length) return Promise.resolve([]);
    return this.progressRepository
      .createQueryBuilder('progress')
      .where('progress.playableKind = :kind', { kind: 'episode' })
      .andWhere('progress.playableKey LIKE :prefix', { prefix: `e:${showMediaId}:%` })
      .andWhere('progress.userId IN (:...userIds)', { userIds })
      .orderBy('progress.updatedAt', 'DESC')
      .getMany();
  }
}
