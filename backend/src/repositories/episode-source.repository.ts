import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { EpisodeSource } from '@entities/episode-source.entity';

export class EpisodeSourceRepository {
  private readonly repository: Repository<EpisodeSource>;
  private mutation: Promise<void> = Promise.resolve();

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutation;
    let release!: () => void;
    this.mutation = new Promise(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  constructor(database: Database) {
    this.repository = database.getRepository(EpisodeSource);
  }

  findByEpisodeId(episodeId: number): Promise<EpisodeSource[]> {
    return this.repository.find({
      where: { episodeId },
      relations: { source: true },
    });
  }

  findForPlayback(
    showMediaId: number,
    seasonNumber: number,
    episodeNumber: number,
    sourceId: number
  ): Promise<EpisodeSource | null> {
    return this.repository
      .createQueryBuilder('episodeSource')
      .innerJoinAndSelect('episodeSource.source', 'source')
      .innerJoin('episodeSource.episode', 'episode')
      .innerJoin('episode.season', 'season')
      .innerJoin('season.tvShow', 'show')
      .where('show.mediaId = :showMediaId', { showMediaId })
      .andWhere('season.seasonNumber = :seasonNumber', { seasonNumber })
      .andWhere('episode.episodeNumber = :episodeNumber', { episodeNumber })
      .andWhere('episodeSource.sourceId = :sourceId', { sourceId })
      .getOne();
  }

  async setVideoFilePath(id: number, previousPath: string, canonicalPath: string): Promise<string> {
    return this.serializeMutation(() => this.canonicalize(id, previousPath, canonicalPath));
  }

  private async canonicalize(
    id: number,
    previousPath: string,
    canonicalPath: string
  ): Promise<string> {
    // An already-associated canonical row can win while this provider-relative row exists.
    await this.repository.query(
      'UPDATE OR IGNORE episode_source SET videoFilePath = ? WHERE id = ? AND videoFilePath = ?',
      [canonicalPath, id, previousPath]
    );
    const stored = await this.repository.findOneBy({ id });
    if (!stored) return canonicalPath; // A concurrent resolver already merged this stale row.
    if (stored.videoFilePath !== previousPath) return stored.videoFilePath!;
    const canonical = await this.repository.findOneBy({
      episodeId: stored.episodeId,
      sourceId: stored.sourceId,
      videoFilePath: canonicalPath,
    });
    if (!canonical) throw new Error('Canonical episode file was not stored');
    await this.repository.delete({ id, videoFilePath: previousPath });
    return canonical.videoFilePath!;
  }

  async associate(
    episodeId: number,
    sourceId: number,
    videoFilePath: string | null,
    matchKind: 'combined' | 'single'
  ): Promise<EpisodeSource> {
    return this.serializeMutation(() =>
      this.insertAssociation(episodeId, sourceId, videoFilePath, matchKind)
    );
  }

  private async insertAssociation(
    episodeId: number,
    sourceId: number,
    videoFilePath: string | null,
    matchKind: 'combined' | 'single'
  ): Promise<EpisodeSource> {
    if (videoFilePath) {
      const links = await this.repository.find({ where: { episodeId, sourceId } });
      const exact = links.find(link => link.videoFilePath === videoFilePath);
      const suffixes = links.filter(link => link.videoFilePath?.endsWith('/' + videoFilePath));
      const stored = exact ?? (suffixes.length === 1 ? suffixes[0] : undefined);
      if (stored) {
        if (stored.matchKind !== matchKind) {
          await this.repository.update(stored.id, { matchKind });
          stored.matchKind = matchKind;
        }
        return stored;
      }
    }
    const query = this.repository
      .createQueryBuilder('episodeSource')
      .where('episodeSource.episodeId = :episodeId', { episodeId })
      .andWhere('episodeSource.sourceId = :sourceId', { sourceId });
    if (videoFilePath === null) query.andWhere('episodeSource.videoFilePath IS NULL');
    else query.andWhere('episodeSource.videoFilePath = :videoFilePath', { videoFilePath });
    // SQLite UNIQUE constraints allow multiple NULLs; use one atomic statement for that case.
    if (videoFilePath === null) {
      await this.repository.query(
        'INSERT INTO episode_source (episodeId, sourceId, videoFilePath, matchKind) SELECT ?, ?, NULL, ? WHERE NOT EXISTS (SELECT 1 FROM episode_source WHERE episodeId = ? AND sourceId = ? AND videoFilePath IS NULL)',
        [episodeId, sourceId, matchKind, episodeId, sourceId]
      );
    } else {
      await this.repository
        .createQueryBuilder()
        .insert()
        .into(EpisodeSource)
        .values({ episodeId, sourceId, videoFilePath, matchKind })
        .orIgnore()
        .execute();
    }
    const existing = await query.getOne();
    if (existing) {
      if (existing.matchKind !== matchKind) {
        await this.repository.update(existing.id, { matchKind });
        existing.matchKind = matchKind;
      }
      return existing;
    }
    throw new Error('Episode source association was not stored');
  }
}
