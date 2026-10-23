import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { MediaProbe } from '@entities/media-probe.entity';

export class MediaProbeRepository {
  private readonly repository: Repository<MediaProbe>;

  constructor(db: Database) {
    this.repository = db.getRepository(MediaProbe);
  }

  async find(sourceId: number, filePath: string): Promise<string | null> {
    const probe = await this.repository.findOne({ where: { sourceId, filePath } });
    return probe?.result ?? null;
  }

  /** First writer wins: concurrent probes of one file produce the same result. */
  async save(sourceId: number, filePath: string, result: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(MediaProbe)
      .values({ sourceId, filePath, result })
      .orIgnore()
      .execute();
  }
}
