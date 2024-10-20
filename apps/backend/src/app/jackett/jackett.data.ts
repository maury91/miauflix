import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Torrent,
  TorrentCreationAttributes,
} from '../database/entities/torrent.entity';
// import { Movie } from '../database/entities/movie.entity';
import { createHmac } from 'node:crypto';
import {
  notProcessedTorrents,
  notProcessedTorrentsForMovie,
} from './jackett.queries';
import { Op } from 'sequelize';
import { Movie } from '../database/entities/movie.entity';
import { VideoQuality } from './jackett.types';

@Injectable()
export class JackettData {
  constructor(
    @InjectModel(Torrent) private readonly torrentModel: typeof Torrent,
    @InjectModel(Movie) private readonly movieModel: typeof Movie
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

  async getTorrentsToProcess() {
    const [firstResult] = await this.torrentModel.sequelize.query(
      notProcessedTorrents
    );
    const ids = firstResult.map(({ id }: { id: number }) => id);

    const torrentsToProcess = (await this.torrentModel.findAll({
      attributes: ['id', 'movieId', 'quality', 'url'],
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    })) as Required<Pick<Torrent, 'id' | 'movieId' | 'quality' | 'url'>>[];

    const movieIds = torrentsToProcess.map(({ movieId }) => movieId);
    const movies = await this.movieModel.findAll({
      where: {
        id: {
          [Op.in]: movieIds,
        },
      },
    });

    return torrentsToProcess.map((torrent) => {
      const movie = movies.find(({ id }) => id === torrent.movieId);
      return {
        id: torrent.id,
        movieId: torrent.movieId,
        quality: torrent.quality,
        runtime: movie.runtime,
        url: torrent.url,
      };
    });
  }

  async getTorrentsToProcessForMovie(movieId: number) {
    const [firstResult] = await this.torrentModel.sequelize.query(
      notProcessedTorrentsForMovie,
      {
        replacements: { movieId: movieId },
      }
    );
    const ids = firstResult.map(({ id }: { id: number }) => id);

    const torrentsToProcess = (await this.torrentModel.findAll({
      attributes: ['id', 'quality', 'url'],
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    })) as Required<Pick<Torrent, 'id' | 'quality' | 'url'>>[];
    const movie = await this.movieModel.findByPk(movieId);

    return torrentsToProcess.map((torrent) => ({
      id: torrent.id,
      movieId: movieId,
      quality: torrent.quality,
      runtime: movie.runtime,
      url: torrent.url,
    }));
  }

  async updateTorrentData(id: number, data: Buffer) {
    return this.torrentModel.update(
      {
        data,
        processed: true,
      },
      { where: { id } }
    );
  }

  async skipTorrentsForMovie(movieId: number, quality: VideoQuality) {
    return this.torrentModel.update(
      {
        skip: true,
      },
      { where: { movieId, quality, processed: false }, returning: true }
    );
  }
}
