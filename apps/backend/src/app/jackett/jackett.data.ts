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
import { VideoCodec, VideoQuality } from '@miauflix/types';
import { UNIFY_10_BIT_CODECS } from '../torrent/torrent.const';

function getCodecGroup(codec: VideoCodec): VideoCodec[] {
  if (!UNIFY_10_BIT_CODECS) {
    return [codec];
  }
  switch (codec) {
    case 'AV1':
    case 'AV1 10bit':
      return ['AV1', 'AV1 10bit'];
    case 'x265':
    case 'x265 10bit':
      return ['x265', 'x265 10bit'];
    case 'x264':
    case 'x264 10bit':
      return ['x264', 'x264 10bit'];
  }
  return [codec];
}

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
      attributes: ['id', 'movieId', 'codec', 'quality', 'source', 'url'],
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    })) as Required<
      Pick<Torrent, 'id' | 'codec' | 'movieId' | 'source' | 'quality' | 'url'>
    >[];

    const movieIds = torrentsToProcess.map(({ movieId }) => movieId);
    const movies = await this.movieModel.findAll({
      where: {
        id: {
          [Op.in]: movieIds,
        },
      },
    });

    const counts: Partial<Record<number, number>> = {};

    return torrentsToProcess.map((torrent) => {
      const movie = movies.find(({ id }) => id === torrent.movieId);
      if (!counts[torrent.movieId]) {
        counts[torrent.movieId] = 0;
      }
      const count = counts[torrent.movieId]++;
      return {
        id: torrent.id,
        movieId: torrent.movieId,
        codec: torrent.codec,
        quality: torrent.quality,
        source: torrent.source,
        runtime: movie.runtime,
        url: torrent.url,
        count,
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
      attributes: ['id', 'codec', 'quality', 'source', 'url'],
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    })) as Required<
      Pick<Torrent, 'id' | 'codec' | 'quality' | 'source' | 'url'>
    >[];
    const movie = await this.movieModel.findByPk(movieId);
    return torrentsToProcess.map((torrent, index) => ({
      id: torrent.id,
      movieId: movieId,
      codec: torrent.codec,
      quality: torrent.quality,
      source: torrent.source,
      runtime: movie.runtime,
      url: torrent.url,
      count: index,
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

  async skipTorrentsForMovie(
    movieId: number,
    codec: VideoCodec,
    quality: VideoQuality
  ) {
    return this.torrentModel.update(
      {
        skip: true,
      },
      {
        where: {
          movieId,
          codec: {
            [Op.in]: getCodecGroup(codec),
          },
          quality,
          processed: false,
        },
        returning: true,
      }
    );
  }
}
