import type { DataSource, Repository } from 'typeorm';

import { Progress } from '@entities/progress.entity';

export class ProgressRepository {
  private readonly progressRepository: Repository<Progress>;

  constructor(dataSource: DataSource) {
    this.progressRepository = dataSource.getRepository(Progress);
  }

  async findAll(): Promise<Progress[]> {
    return this.progressRepository.find();
  }
}
