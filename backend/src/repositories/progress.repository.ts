import type { DataSource, Repository } from 'typeorm';

import { Progress } from '@entities/progress.entity';
import type { PlayableRef } from '@routes/playable.types';
import { playableKey } from '@routes/playable.types';

export type ProgressUpdate = Pick<Progress, 'durationSeconds' | 'positionSeconds' | 'state'> & {
  playable: PlayableRef;
};

export class ProgressRepository {
  private readonly progressRepository: Repository<Progress>;

  constructor(dataSource: DataSource) {
    this.progressRepository = dataSource.getRepository(Progress);
  }

  async upsert(userId: string, update: ProgressUpdate): Promise<Progress> {
    const row = {
      userId,
      playableKind: update.playable.kind,
      playableKey: playableKey(update.playable),
      positionSeconds: update.positionSeconds,
      durationSeconds: update.durationSeconds,
      state: update.state,
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
}
