import { Global, Injectable, Module } from '@nestjs/common';
import {
  Torrent,
  TorrentCreationAttributes,
} from '../../database/entities/torrent.entity';
import { GetTorrentFileData, VideoCodec, VideoQuality } from '@miauflix/types';
import { Movie } from '../../database/entities/movie.entity';
import { MovieSource } from '../../database/entities/movie.source.entity';
import { createHmac } from 'node:crypto';
import { Episode } from '../../database/entities/episode.entity';
import { EpisodeSource } from '../../database/entities/episode.source.entity';
import { Show } from '../../database/entities/show.entity';
import { Season } from '../../database/entities/season.entity';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import {
  Brackets,
  FindOptionsWhere,
  In,
  LessThan,
  Like,
  Not,
  Repository,
} from 'typeorm';

@Injectable()
export class TorrentData {
  constructor(
    // private readonly movieProcessorService: MovieProcessorService,
    @InjectRepository(Movie) private readonly movieModel: Repository<Movie>,
    @InjectRepository(Episode)
    private readonly episodeModel: Repository<Episode>,
    @InjectRepository(Torrent)
    private readonly torrentModel: Repository<Torrent>,
    @InjectRepository(MovieSource)
    private readonly movieSourceModel: Repository<MovieSource>,
    @InjectRepository(EpisodeSource)
    private readonly episodeSourceModel: Repository<EpisodeSource>
  ) {}

  async createTorrent(
    torrent: Omit<TorrentCreationAttributes, 'uuid'>
  ): Promise<Torrent> {
    const torrentUuid = createHmac('sha256', '')
      .update(torrent.url)
      .digest('hex');

    const existingTorrent = await this.torrentModel.findOne({
      where: {
        uuid: torrentUuid,
      },
    });

    if (existingTorrent) {
      return existingTorrent;
    }

    return this.torrentModel.save({ ...torrent, uuid: torrentUuid });
  }

  async findTorrentToProcess({
    mediaId,
    mediaType,
    highQuality,
    hevc,
  }: {
    mediaId: number;
    mediaType: 'movie' | 'episode';
    highQuality: boolean;
    hevc: boolean;
  }): Promise<Torrent[]> {
    const query = `${
      mediaType === 'movie' ? '"movieId"' : '"episodeId"'
    } = :mediaId AND quality ${highQuality ? '>' : '<='} 1080 AND codec ${
      hevc ? 'LIKE' : 'NOT LIKE'
    } '%x265%' AND processed = false`;

    const minimumSeeds = await this.torrentModel
      .createQueryBuilder('torrent')
      .select(
        'PERCENTILE_CONT(0.3) WITHIN GROUP (ORDER BY torrent.seeders)',
        'median_seeders'
      )
      .addSelect('torrent.quality')
      .where(query, { mediaId })
      .groupBy('torrent.quality')
      .getRawMany<{ median_seeders: number; torrent_quality: VideoQuality }>();

    console.log('minimumSeeds', minimumSeeds);

    return this.torrentModel
      .createQueryBuilder('torrent')
      .where(query, { mediaId })
      .andWhere(
        new Brackets((qb) => {
          minimumSeeds.forEach(({ median_seeders, torrent_quality }, index) => {
            qb.orWhere(
              `quality = :quality${index} AND seeders >= :seeders${index}`,
              {
                [`quality${index}`]: torrent_quality,
                [`seeders${index}`]: Math.floor(median_seeders),
              }
            );
          });
        })
      )
      .leftJoinAndSelect(
        mediaType === 'movie' ? Movie : Episode,
        'media',
        `media.id = torrent.${mediaType === 'movie' ? 'movieId' : 'episodeId'}`
      )
      .orderBy(
        "CASE WHEN source = 'WEB' OR source = 'Blu-ray' THEN 3 WHEN source = 'HDTV' OR source = 'DVD' THEN 2 WHEN source = 'TS' OR source = 'unknown' THEN 1 WHEN source = 'Cam' THEN 0 END",
        'DESC'
      )
      .addOrderBy('quality', 'DESC')
      .addOrderBy('size / media.runtime', 'ASC')
      .limit(2)
      .getMany();
  }

  private chooseBestSource<
    T extends { quality: VideoQuality; size: number; availability: number }
  >(hevc: T | null, notHevc: T | null) {
    if (hevc) {
      if (notHevc) {
        if (notHevc.quality >= hevc.quality) {
          const notHevcNotTooBig = hevc.size * 1.2 >= notHevc.size;
          const notHevcHasMoreAvailability =
            notHevc.availability >= hevc.availability;
          if (notHevcNotTooBig && notHevcHasMoreAvailability) {
            return notHevc;
          }
        }
      }
      return hevc;
    }

    return notHevc;
  }

  private async getOneTorrentByMovieAndQuality(
    slug: string,
    useHevc: boolean,
    useLowQuality: boolean
  ): Promise<MovieSource | null> {
    const baseWhere: FindOptionsWhere<MovieSource> = {
      movieSlug: slug,
      rejected: false,
      ...(useLowQuality
        ? {
            quality: LessThan(1080),
          }
        : {}),
    };

    const bestSourceNotHvec = await this.movieSourceModel
      .createQueryBuilder('movie')
      .select(
        '"quality" * "availability" / ("size" * (100-"downloadPercentage") / 1000000)',
        'score'
      )
      .addSelect('data')
      .addSelect('videos')
      .addSelect('id')
      .addSelect('availability')
      .addSelect('size')
      .addSelect('quality')
      .where({
        ...baseWhere,
        codec: Not(Like('%x265%' as VideoCodec)),
      })
      .orderBy('score', 'DESC')
      .getOne();

    if (useHevc) {
      const bestSourceHevc = await this.movieSourceModel
        .createQueryBuilder('movie')
        .select(
          '"quality" * "availability" / ("size" * (100-"downloadPercentage") / 1000000)',
          'score'
        )
        .addSelect('data')
        .addSelect('videos')
        .addSelect('id')
        .addSelect('availability')
        .addSelect('size')
        .addSelect('quality')
        .where({
          ...baseWhere,
          codec: Like('%x265%' as VideoCodec),
        })
        .orderBy('score', 'DESC')
        .getOne();

      return this.chooseBestSource(bestSourceHevc, bestSourceNotHvec);
    }

    return bestSourceNotHvec;
  }

  async getTorrentByMovieAndQuality(
    slug: string,
    useHevc: boolean,
    useLowQuality: boolean
  ): Promise<MovieSource | null> {
    const bestSource = await this.getOneTorrentByMovieAndQuality(
      slug,
      useHevc,
      useLowQuality
    );

    if (bestSource) {
      return bestSource;
    }

    if (useLowQuality) {
      return this.getOneTorrentByMovieAndQuality(slug, useHevc, false);
    }

    return null;
  }

  private async getOneTorrentByEpisodeAndQuality(
    episodeId: number,
    useHevc: boolean,
    useLowQuality: boolean
  ): Promise<EpisodeSource | null> {
    const baseWhere: FindOptionsWhere<EpisodeSource> = {
      episodeId,
      rejected: false,
      ...(useLowQuality
        ? {
            quality: LessThan(1080),
          }
        : {}),
    };

    const bestSourceNotHvec = await this.episodeSourceModel
      .createQueryBuilder('source')
      .select(
        '"quality" * "availability" / ("size" * (101-"downloadPercentage") / 1000000)',
        'score'
      )
      .addSelect('source.*')
      .where({
        ...baseWhere,
        codec: Not(Like('%x265%' as VideoCodec)),
      })
      .orderBy('score', 'DESC')
      .getRawOne();

    console.log('bestSourceNotHvec', bestSourceNotHvec);

    if (useHevc) {
      const bestSourceHevc = await this.episodeSourceModel
        .createQueryBuilder('source')
        .select(
          '"quality" * "availability" / ("size" * (101-"downloadPercentage") / 1000000)',
          'score'
        )
        .addSelect('source.*')
        .where({
          ...baseWhere,
          codec: Like('%x265%' as VideoCodec),
        })
        .orderBy('score', 'DESC')
        .getRawOne();

      console.log('bestSourceHevc', bestSourceHevc);

      return this.chooseBestSource(bestSourceHevc, bestSourceNotHvec);
    }

    return bestSourceNotHvec;
  }

  async getTorrentByEpisodeAndQuality(
    episodeId: number,
    useHevc: boolean,
    useLowQuality: boolean
  ): Promise<EpisodeSource | null> {
    const bestSource = this.getOneTorrentByEpisodeAndQuality(
      episodeId,
      useHevc,
      useLowQuality
    );

    if (bestSource) {
      return bestSource;
    }

    if (useLowQuality) {
      return this.getOneTorrentByEpisodeAndQuality(episodeId, useHevc, false);
    }

    return null;
  }

  async getTorrentsToProcess() {
    const notProcessedMovies = await this.movieModel.find({
      select: ['id'],
      where: {
        sourcesSearched: false,
        sourceFound: false,
      },
    });
    const notProcessedEpisodes = await this.episodeModel.find({
      select: ['id'],
      where: {
        sourcesSearched: true, // We have a lot of episode in the database, better not search everything but only what have been requested
        sourceFound: false,
      },
    });

    if (!notProcessedMovies.length && !notProcessedEpisodes.length) {
      return [];
    }

    const torrentGroups = await this.torrentModel
      .createQueryBuilder('torrent')
      .select('torrent.movieId')
      .addSelect('torrent.episodeId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('torrent.quality > 1080', 'highQuality')
      .addSelect("torrent.codec LIKE '%x265%'", 'hevc')
      .where('torrent.processed = false')
      .andWhere(
        new Brackets((qb) => {
          const movieQuery = 'torrent.movieId IN (:...movieIds)';
          const episodeQuery = 'torrent.episodeId IN (:...episodeIds)';
          const movieIds = notProcessedMovies.map(({ id }) => id);
          const episodeIds = notProcessedEpisodes.map(({ id }) => id);

          if (notProcessedMovies.length && notProcessedEpisodes.length) {
            qb.where(movieQuery, {
              movieIds,
            }).orWhere(episodeQuery, {
              episodeIds,
            });
          } else if (notProcessedMovies.length) {
            qb.where(movieQuery, { movieIds });
          } else if (notProcessedEpisodes.length) {
            qb.where(episodeQuery, { episodeIds });
          }
        })
      )
      .groupBy('"highQuality"')
      .addGroupBy('hevc')
      .addGroupBy('"movieId"')
      .addGroupBy('"episodeId"')
      .getRawMany<{
        torrent_movieId: number | null;
        torrent_episodeId: number | null;
        highQuality: boolean;
        hevc: boolean;
      }>();

    if (!torrentGroups.length) {
      return [];
    }

    const movieIds = new Set(
      torrentGroups
        .map(({ torrent_movieId }) => torrent_movieId)
        .filter((id) => id !== null) satisfies number[]
    );
    const movies = await this.movieModel.find({
      select: ['id', 'runtime'],
      where: {
        id: In([...movieIds]),
      },
    });

    const episodeIds = new Set(
      torrentGroups
        .map(({ torrent_episodeId }) => torrent_episodeId)
        .filter((id) => id !== null) satisfies number[]
    );
    const episodes = await this.episodeModel.find({
      select: ['id', 'runtime'],
      where: {
        id: In([...episodeIds]),
      },
    });

    console.log('torrentGroups', torrentGroups);
    console.log('movies', movies);

    return torrentGroups.map<GetTorrentFileData>(
      ({ highQuality, hevc, torrent_movieId, torrent_episodeId }) => {
        if (torrent_episodeId) {
          return {
            mediaId: torrent_episodeId,
            mediaType: 'episode',
            runtime: episodes.find(({ id }) => id === torrent_episodeId)
              .runtime,
            highQuality,
            hevc,
          };
        }
        return {
          mediaId: torrent_movieId,
          mediaType: 'movie',
          runtime: movies.find(({ id }) => id === torrent_movieId).runtime,
          highQuality,
          hevc,
        };
      }
    );
  }

  async getTorrentsToProcessForMedia(
    mediaId: number,
    mediaType: 'movie' | 'episode'
  ) {
    const torrentGroups = await this.torrentModel
      .createQueryBuilder('torrent')
      .select('COUNT(*)', 'count')
      .addSelect('torrent.quality > 1080', 'highQuality')
      .addSelect("torrent.codec LIKE '%x265%'", 'hevc')
      .where(
        mediaType === 'movie' ? { movieId: mediaId } : { episodeId: mediaId }
      )
      .andWhere('torrent.processed = false')
      .groupBy('"highQuality"')
      .addGroupBy('hevc')
      .getRawMany<{
        highQuality: boolean;
        hevc: boolean;
      }>();

    const { runtime } = await (mediaType === 'movie'
      ? this.movieModel.findOneBy({ id: mediaId })
      : this.episodeModel.findOneBy({ id: mediaId }));
    return torrentGroups.map<GetTorrentFileData>(({ highQuality, hevc }) => ({
      mediaId,
      mediaType,
      runtime,
      highQuality,
      hevc,
    }));
  }

  async markTorrentAsBroken(type: 'movie' | 'episode', sourceId: number) {
    if (type === 'movie') {
      // ToDo
    } else {
      const source = await this.episodeSourceModel.findOne({
        where: { id: sourceId },
        relations: {
          episode: true,
        },
      });
      if (!source) {
        throw new Error('Source not found');
      }
      console.log('Updating source');
      await this.episodeSourceModel.update(source.id, { rejected: true });
      if (source.originalSource.includes('torrent::')) {
        console.log('Updating torrent');
        const torrentId = parseInt(source.originalSource.split('::')[1], 10);
        const torrent = await this.torrentModel.findOneBy({ id: torrentId });
        if (!torrent) {
          throw new Error('Torrent not found');
        }
        await this.torrentModel.update(torrent.id, { rejected: true });
      }
      console.log('Updating episode');
      await this.episodeModel.update(source.episode.id, { sourceFound: false });
    }
  }

  async setProcessed(torrentId: number) {
    await this.torrentModel.update(torrentId, { processed: true });
  }

  async setRejected(torrentId: number) {
    await this.torrentModel.update(torrentId, {
      processed: true,
      rejected: true,
    });
  }
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Torrent,
      Movie,
      MovieSource,
      Show,
      Season,
      Episode,
      EpisodeSource,
    ]),
  ],
  providers: [TorrentData],
  exports: [TorrentData, TypeOrmModule],
})
export class TorrentDataModule {}
