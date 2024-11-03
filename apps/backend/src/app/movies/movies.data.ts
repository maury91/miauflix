import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import {
  Movie,
  MovieCreationAttributes,
} from '../database/entities/movie.entity';
import { Movie as TraktMovie } from '../trakt/trakt.types';
import { Op } from 'sequelize';
import { MovieDto } from '@miauflix/types';
import { Torrent } from '../database/entities/torrent.entity';
import { Source } from '../database/entities/source.entity';

@Injectable()
export class MoviesData {
  constructor(@InjectModel(Movie) private readonly movieModel: typeof Movie) {}

  async findMovie(slug: string): Promise<Movie | null> {
    return await this.movieModel.findOne({
      where: {
        slug,
      },
    });
  }

  async findMovieWithSources(slug: string): Promise<Movie | null> {
    return await this.movieModel.findOne({
      where: {
        slug,
      },
      include: {
        model: Source,
        as: 'allSources',
        attributes: ['data', 'quality', 'codec'],
      },
    });
  }

  async findTraktMovie(slug: string): Promise<TraktMovie | null> {
    const movie = await this.movieModel.findOne({
      attributes: ['slug', 'traktId', 'imdbId', 'tmdbId', 'title', 'year'],
      where: {
        slug,
      },
      raw: true,
    });

    if (!movie) {
      return null;
    }

    return {
      ids: {
        slug: movie.slug,
        trakt: movie.traktId,
        imdb: movie.imdbId,
        tmdb: movie.tmdbId,
      },
      title: movie.title,
      year: movie.year,
    };
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

  async findMoviesMap(slugs: string[]): Promise<Record<string, MovieDto>> {
    const storedMovies = await this.findMovies(slugs);
    return storedMovies.reduce<Record<string, MovieDto>>(
      (acc, movie) => ({
        ...acc,
        [movie.slug]: {
          // ...movie,
          id: movie.slug,
          title: movie.title,
          year: movie.year,
          ids: {
            trakt: movie.traktId,
            slug: movie.slug,
            imdb: movie.imdbId,
            tmdb: movie.tmdbId,
          },
          noSourceFound: movie.noSourceFound,
          sourceFound: movie.torrentFound,
          images: {
            poster: movie.poster,
            backdrop: movie.backdrop,
            backdrops: movie.backdrops,
            logos: movie.logos,
          },
        },
      }),
      {}
    );
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

  async setnoSourceFound(id: number): Promise<void> {
    await this.movieModel.update({ noSourceFound: true }, { where: { id } });
  }
}

@Global()
@Module({
  imports: [SequelizeModule.forFeature([Movie, Torrent, Source])],
  providers: [MoviesData],
  exports: [MoviesData, SequelizeModule],
})
export class MoviesDataModule {}
