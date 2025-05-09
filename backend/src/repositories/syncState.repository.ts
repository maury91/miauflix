import type { DataSource, Repository } from 'typeorm';

import { SyncState } from '@entities/sync-state.entity';

export class SyncStateRepository {
  private readonly repository: Repository<SyncState>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(SyncState);
  }

  async getByName(name: string): Promise<SyncState | null> {
    return this.repository.findOne({ where: { name } });
  }

  async setLastSync(name: string, lastSync: Date): Promise<void> {
    let state = await this.getByName(name);
    if (!state) {
      state = this.repository.create({ name, lastSync });
    } else {
      state.lastSync = lastSync;
    }
    await this.repository.save(state);
  }

  async getLastSync(name: string): Promise<Date | null> {
    const state = await this.getByName(name);
    return state?.lastSync ?? null;
  }
}
