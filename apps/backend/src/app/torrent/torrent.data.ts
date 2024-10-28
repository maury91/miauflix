import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Torrent,
  TorrentCreationAttributes,
} from '../database/entities/torrent.entity';
import { VideoQuality } from '@miauflix/types';
import { Movie } from '../database/entities/movie.entity';
import sequelize, { Op, Sequelize, WhereOptions } from 'sequelize';
import { Source } from '../database/entities/source.entity';
import { createHmac } from 'node:crypto';
import { GetTorrentFileData } from '../../queues';

@Injectable()
export class TorrentData {
  constructor(
    // private readonly movieProcessorService: MovieProcessorService,
    @InjectModel(Movie) private readonly movieModel: typeof Movie,
    @InjectModel(Torrent) private readonly torrentModel: typeof Torrent,
    @InjectModel(Source) private readonly sourceModel: typeof Source
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
    movieId,
    highQuality,
    hevc,
  }: {
    movieId: number;
    highQuality: boolean;
    hevc: boolean;
  }): Promise<Torrent[]> {
    const filter: WhereOptions = {
      movieId,
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
    const source = await this.sourceModel.findOne({
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

    // Todo: If no source has been found do the entire process to create one

    return {
      torrentFile: source.data,
      videos: source.videos,
    };
  }

  async getTorrentsToProcess() {
    const notProcessedMovies = await this.movieModel.findAll({
      attributes: ['id'],
      where: {
        torrentsSearched: false,
        noTorrentFound: false,
      },
      raw: true,
    });
    const torrentGroups = (await this.torrentModel.findAll({
      attributes: [
        'movieId',
        [sequelize.fn('COUNT', sequelize.col('*')), 'count'],
        [sequelize.literal('"quality" > 1080'), 'highQuality'],
        [sequelize.literal('"codec" LIKE \'%x265%\''), 'hevc'],
      ],
      where: {
        processed: false,
        movieId: {
          [Op.in]: notProcessedMovies.map(({ id }) => id),
        },
      },
      group: ['highQuality', 'hevc', 'movieId'],
      raw: true,
    })) as unknown as {
      movieId: number;
      highQuality: boolean;
      hevc: boolean;
    }[];

    if (!torrentGroups.length) {
      return [];
    }
    const movieIds = new Set(torrentGroups.map(({ movieId }) => movieId));
    const movies = await this.movieModel.findAll({
      attributes: ['id', 'runtime'],
      where: {
        id: {
          [Op.in]: [...movieIds],
        },
      },
      raw: true,
    });
    return torrentGroups.map<GetTorrentFileData>(
      ({ highQuality, hevc, movieId }) => ({
        movieId,
        runtime: movies.find(({ id }) => id === movieId).runtime,
        highQuality,
        hevc,
      })
    );
  }

  async getTorrentsToProcessForMovie(movieId: number) {
    const torrentGroups = (await this.torrentModel.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('*')), 'count'],
        [sequelize.literal('"quality" > 1080'), 'highQuality'],
        [sequelize.literal('"codec" LIKE \'%x265%\''), 'hevc'],
      ],
      where: {
        movieId,
        processed: false,
      },
      group: ['highQuality', 'hevc'],
      raw: true,
    })) as unknown as { highQuality: boolean; hevc: boolean }[];

    const movie = await this.movieModel.findByPk(movieId);
    return torrentGroups.map<GetTorrentFileData>(({ highQuality, hevc }) => ({
      movieId,
      runtime: movie.runtime,
      highQuality,
      hevc,
    }));
  }
}
