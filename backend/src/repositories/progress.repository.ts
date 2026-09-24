import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { Progress } from '@entities/progress.entity';

export class ProgressRepository {
  private readonly progressRepository: Repository<Progress>;

  constructor(database: Database) {
    this.progressRepository = database.getRepository(Progress);
  }

  async findAll(): Promise<Progress[]> {
    return this.progressRepository.find();
  }
}
