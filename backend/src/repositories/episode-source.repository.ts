import type { Repository } from 'typeorm';

import type { Database } from '@database/database';
import { EpisodeSource } from '@entities/episode-source.entity';

export class EpisodeSourceRepository {
  private readonly repository: Repository<EpisodeSource>;

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

  async associate(
    episodeId: number,
    sourceId: number,
    videoFilePath: string | null,
    matchKind: 'combined' | 'single'
  ): Promise<EpisodeSource> {
    const query = this.repository
      .createQueryBuilder('episodeSource')
      .where('episodeSource.episodeId = :episodeId', { episodeId })
      .andWhere('episodeSource.sourceId = :sourceId', { sourceId });
    if (videoFilePath === null) query.andWhere('episodeSource.videoFilePath IS NULL');
    else query.andWhere('episodeSource.videoFilePath = :videoFilePath', { videoFilePath });
    const existing = await query.getOne();
    if (existing) {
      if (existing.matchKind !== matchKind) {
        existing.matchKind = matchKind;
        return this.repository.save(existing);
      }
      return existing;
    }
    return this.repository.save(
      this.repository.create({ episodeId, sourceId, videoFilePath, matchKind })
    );
  }
}
