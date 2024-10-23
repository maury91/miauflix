import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Movie,
  MovieCreationAttributes,
} from '../database/entities/movie.entity';
import { Op } from 'sequelize';

@Injectable()
export class MoviesData {
  constructor(@InjectModel(Movie) private readonly movieModel: typeof Movie) {}

  async findMovie(slug: string): Promise<Movie | null> {
    return await this.movieModel.findOne({
      where: {
        slug,
      },
      raw: true,
    });
  }

  async findMovies(slugs: string[]): Promise<Movie[]> {
    return await this.movieModel.findAll({
      where: {
        slug: {
          [Op.in]: slugs,
        },
      },
      raw: true,
    });
  }

  async createMovie(movie: MovieCreationAttributes): Promise<Movie> {
    return (await this.movieModel.upsert(movie))[0];
  }

  async setTorrentSearched(id: number): Promise<void> {
    await this.movieModel.update({ torrentsSearched: true }, { where: { id } });
  }

  async setTorrentFound(id: number, torrentId: number): Promise<void> {
    await this.movieModel.update(
      { torrentFound: true, torrentId },
      { where: { id } }
    );
  }

  async setNoTorrentFound(id: number): Promise<void> {
    await this.movieModel.update({ noTorrentFound: true }, { where: { id } });
  }
}
