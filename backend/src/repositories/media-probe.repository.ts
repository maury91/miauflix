import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { MediaProbe } from '@entities/media-probe.entity';
import { probeCodecs } from '@repositories/media-variant.repository';

export class MediaProbeRepository {
  private readonly repository: Repository<MediaProbe>;

  constructor(private readonly db: Database) {
    this.repository = db.getRepository(MediaProbe);
  }

  async find(sourceId: number, filePath: string): Promise<string | null> {
    const probe = await this.repository.findOne({ where: { sourceId, filePath } });
    return probe?.result ?? null;
  }

  /**
   * First writer wins: concurrent probes of one file produce the same result. The file is also
   * recorded as its source's original version, with its codecs.
   */
  async save(sourceId: number, filePath: string, result: string): Promise<void> {
    // One transaction: a stored probe always has its original version recorded, from the probe
    // kept (the first one, when another was stored meanwhile).
    await this.db.transaction(async manager => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(MediaProbe)
        .values({ sourceId, filePath, result })
        .orIgnore()
        .execute();
      const kept = await manager.findOne(MediaProbe, { where: { sourceId, filePath } });
      await this.db
        .getMediaVariantRepository()
        .save(
          sourceId,
          filePath,
          'original',
          'ready',
          probeCodecs(JSON.parse(kept?.result ?? result)),
          manager
        );
    });
  }

  /** Every stored probe, for backfills. */
  all(): Promise<Array<{ sourceId: number; filePath: string; result: string }>> {
    return this.repository.find({ select: ['sourceId', 'filePath', 'result'] });
  }
}
