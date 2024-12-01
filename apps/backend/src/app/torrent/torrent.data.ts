import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import {
  Torrent,
  TorrentCreationAttributes,
} from '../database/entities/torrent.entity';
import { GetTorrentFileData, VideoQuality } from '@miauflix/types';
import { Movie } from '../database/entities/movie.entity';
import sequelize, { Op, Sequelize, WhereOptions } from 'sequelize';
import { MovieSource } from '../database/entities/movie.source.entity';
import { createHmac } from 'node:crypto';
import { Episode } from '../database/entities/episode.entity';
import { EpisodeSource } from '../database/entities/episode.source.entity';
import { Show } from '../database/entities/show.entity';
import { Season } from '../database/entities/season.entity';

@Injectable()
export class TorrentData {
  constructor(
    // private readonly movieProcessorService: MovieProcessorService,
    @InjectModel(Movie) private readonly movieModel: typeof Movie,
    @InjectModel(Episode) private readonly episodeModel: typeof Episode,
    @InjectModel(Torrent) private readonly torrentModel: typeof Torrent,
    @InjectModel(MovieSource)
    private readonly movieSourceModel: typeof MovieSource,
    @InjectModel(EpisodeSource)
    private readonly episodeSourceModel: typeof EpisodeSource
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

    return this.torrentModel.create({ ...torrent, uuid: torrentUuid });
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
    const filter: WhereOptions = {
      [mediaType === 'movie' ? 'movieId' : 'episodeId']: mediaId,
      quality: {
        [highQuality ? Op.gt : Op.lte]: 1080,
      },
      codec: {
        [hevc ? Op.like : Op.notLike]: '%x265%',
      },
      processed: false,
    };
    const minimumSeeds = (await this.torrentModel.findAll({
      attributes: [
        [
          Sequelize.literal(
            'PERCENTILE_CONT(0.3) WITHIN GROUP (ORDER BY "seeders")'
          ),
          'median_seeders',
        ],
        'quality',
      ],
      where: filter,
      group: ['quality'],
      raw: true,
    })) as unknown as { median_seeders: number; quality: VideoQuality }[];

    return this.torrentModel.findAll({
      where: {
        ...filter,
        [Op.or]: minimumSeeds.map(({ median_seeders, quality }) => ({
          quality,
          seeders: {
            [Op.gte]: median_seeders,
          },
        })),
      },
      include: [
        {
          model: Movie,
        },
      ],
      order: [
        [
          Sequelize.literal(`CASE
            WHEN "source" = 'WEB' OR "source" = 'Blu-ray' THEN 3
            WHEN "source" = 'HDTV' OR "source" = 'DVD' THEN 2
            WHEN "source" = 'TS' OR "source" = 'unknown' THEN 1
            WHEN "source" = 'Cam' THEN 0
        END`),
          'DESC',
        ],
        ['quality', 'DESC'],
        [Sequelize.literal('"size"/"movie"."runtime"'), 'ASC'],
      ],
      limit: 2,
    });
  }

  async getTorrentByMovieAndQuality(
    slug: string,
    useHevc: boolean,
    useLowQuality: boolean
  ) {
    const bestSource = await this.movieSourceModel.findOne({
      attributes: ['data', 'videos'],
      where: {
        movieSlug: slug,
        codec: {
          [useHevc ? Op.like : Op.notLike]: '%x265%',
        },
        ...(useLowQuality
          ? {
              quality: {
                [Op.lte]: 180,
              },
            }
          : {}),
      },
      order: [['quality', 'DESC']],
      raw: true,
    });

    if (bestSource) {
      return bestSource;
    }

    const sameCodec = await this.movieSourceModel.findOne({
      attributes: ['data', 'videos'],
      where: {
        movieSlug: slug,
        codec: {
          [useHevc ? Op.like : Op.notLike]: '%x265%',
        },
      },
      order: [['quality', 'DESC']],
      raw: true,
    });

    if (sameCodec) {
      return sameCodec;
    }

    const highestQuality = await this.movieSourceModel.findOne({
      attributes: ['data', 'videos'],
      where: {
        movieSlug: slug,
      },
      order: [['quality', 'DESC']],
      raw: true,
    });

    if (highestQuality) {
      return highestQuality;
    }

    return null;
  }

  async getTorrentsToProcess() {
    const notProcessedMovies = await this.movieModel.findAll({
      attributes: ['id'],
      where: {
        sourcesSearched: false,
        sourceFound: false,
      },
      raw: true,
    });
    const notProcessedEpisodes = await this.episodeModel.findAll({
      attributes: ['id'],
      where: {
        sourcesSearched: true, // We have a lot of episode in the database, better not search everything but only what have been requested
        sourceFound: false,
      },
      raw: true,
    });
    const torrentGroups = (await this.torrentModel.findAll({
      attributes: [
        'movieId',
        'episodeId',
        [sequelize.fn('COUNT', sequelize.col('*')), 'count'],
        [sequelize.literal('"quality" > 1080'), 'highQuality'],
        [sequelize.literal('"codec" LIKE \'%x265%\''), 'hevc'],
      ],
      where: {
        processed: false,
        [Op.or]: [
          {
            movieId: {
              [Op.in]: notProcessedMovies.map(({ id }) => id),
            },
          },
          {
            episodeId: {
              [Op.in]: notProcessedEpisodes.map(({ id }) => id),
            },
          },
        ],
      },
      group: ['highQuality', 'hevc', 'movieId', 'episodeId'],
      raw: true,
    })) as unknown as {
      movieId: number | null;
      episodeId: number | null;
      highQuality: boolean;
      hevc: boolean;
    }[];

    if (!torrentGroups.length) {
      return [];
    }

    const movieIds = new Set(
      torrentGroups
        .map(({ movieId }) => movieId)
        .filter((id) => id !== null) satisfies number[]
    );
    const movies = await this.movieModel.findAll({
      attributes: ['id', 'runtime'],
      where: {
        id: {
          [Op.in]: [...movieIds],
        },
      },
      raw: true,
    });

    const episodeIds = new Set(
      torrentGroups
        .map(({ episodeId }) => episodeId)
        .filter((id) => id !== null) satisfies number[]
    );
    const episodes = await this.episodeModel.findAll({
      attributes: ['id', 'runtime'],
      where: {
        id: {
          [Op.in]: [...episodeIds],
        },
      },
      raw: true,
    });

    return torrentGroups.map<GetTorrentFileData>(
      ({ highQuality, hevc, movieId, episodeId }) => {
        if (episodeId) {
          return {
            mediaId: episodeId,
            mediaType: 'episode',
            runtime: episodes.find(({ id }) => id === episodeId).runtime,
            highQuality,
            hevc,
          };
        }
        return {
          mediaId: movieId,
          mediaType: 'movie',
          runtime: movies.find(({ id }) => id === movieId).runtime,
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
    const torrentGroups = (await this.torrentModel.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('*')), 'count'],
        [sequelize.literal('"quality" > 1080'), 'highQuality'],
        [sequelize.literal('"codec" LIKE \'%x265%\''), 'hevc'],
      ],
      where: {
        [mediaType === 'movie' ? 'movieId' : 'episodeId']: mediaId,
        processed: false,
      },
      group: ['highQuality', 'hevc'],
      raw: true,
    })) as unknown as { highQuality: boolean; hevc: boolean }[];

    const { runtime } = await (mediaType === 'movie'
      ? this.movieModel.findByPk(mediaId, { raw: true })
      : this.episodeModel.findByPk(mediaId, { raw: true }));
    return torrentGroups.map<GetTorrentFileData>(({ highQuality, hevc }) => ({
      mediaId,
      mediaType,
      runtime,
      highQuality,
      hevc,
    }));
  }
}

@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
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
  exports: [TorrentData, SequelizeModule],
})
export class TorrentDataModule {}
