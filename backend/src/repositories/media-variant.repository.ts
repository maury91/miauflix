import type { EntityManager, Repository } from 'typeorm';

import type { Database } from '@database/database';
import {
  MediaVariant,
  type MediaVariantKind,
  type MediaVariantState,
} from '@entities/media-variant.entity';

/** The codecs of a version of a file. */
export interface VariantCodecs {
  container: string | null;
  videoCodec: string | null;
  audioCodecs: string[];
}

/** The codecs of a file as ffprobe saw it. */
export function probeCodecs(probe: {
  format?: { format_name?: string };
  streams?: Array<{ codec_type?: string; codec_name?: string }>;
}): VariantCodecs {
  const streams = probe.streams ?? [];
  return {
    container: probe.format?.format_name ?? null,
    videoCodec: streams.find(stream => stream.codec_type === 'video')?.codec_name ?? null,
    audioCodecs: streams
      .filter(stream => stream.codec_type === 'audio')
      .map(stream => stream.codec_name ?? 'unknown'),
  };
}

export class MediaVariantRepository {
  private readonly repository: Repository<MediaVariant>;

  constructor(private readonly db: Database) {
    this.repository = db.getRepository(MediaVariant);
  }

  find(sourceId: number, filePath: string, kind: MediaVariantKind): Promise<MediaVariant | null> {
    return this.repository.findOne({ where: { sourceId, filePath, kind } });
  }

  /**
   * Record a version of a file, or update the one recorded. Within a transaction, pass its
   * manager: the write then belongs to it.
   */
  async save(
    sourceId: number,
    filePath: string,
    kind: MediaVariantKind,
    state: MediaVariantState,
    codecs: VariantCodecs,
    manager?: EntityManager
  ): Promise<void> {
    const upsert = (on: EntityManager) =>
      on
        .createQueryBuilder()
        .insert()
        .into(MediaVariant)
        .values({ sourceId, filePath, kind, state, ...codecs })
        .orUpdate(
          ['state', 'container', 'videoCodec', 'audioCodecs', 'updatedAt'],
          ['sourceId', 'k', 'kind']
        )
        .execute();
    if (manager) await upsert(manager);
    else await this.db.write(() => upsert(this.repository.manager));
  }

  /** Mark a recorded version; false when it is not recorded. */
  async setState(
    sourceId: number,
    filePath: string,
    kind: MediaVariantKind,
    state: MediaVariantState
  ): Promise<boolean> {
    const existing = await this.find(sourceId, filePath, kind);
    if (!existing) return false;
    if (existing.state !== state) await this.repository.update(existing.id, { state });
    return true;
  }

  async remove(sourceId: number, filePath: string, kind: MediaVariantKind): Promise<void> {
    const existing = await this.find(sourceId, filePath, kind);
    if (existing) await this.repository.delete(existing.id);
  }
}
