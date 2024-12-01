import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import {
  Movie,
  MovieCreationAttributes,
} from '../database/entities/movie.entity';
import { Movie as TraktMovie } from '../trakt/trakt.types';
import { Op, Sequelize } from 'sequelize';
import { MovieDto } from '@miauflix/types';
import { Torrent } from '../database/entities/torrent.entity';
import { MovieSource } from '../database/entities/movie.source.entity';

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

  async findMovieById(id: number): Promise<Movie | null> {
    return await this.movieModel.findByPk(id, {
      raw: true,
    });
  }

  async findMoviesWithoutImages(): Promise<Movie[]> {
    return await this.movieModel.findAll({
      where: {
        [Op.or]: [
          {
            poster: '',
          },
          Sequelize.where(
            Sequelize.fn('cardinality', Sequelize.col('backdrops')),
            0
          ),
        ],
      },
    });
  }

  async findMovieWithSources(slug: string): Promise<Movie | null> {
    return await this.movieModel.findOne({
      where: {
        slug,
      },
      include: {
        model: MovieSource,
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
          type: 'movie',
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
          sourceFound: movie.sourceFound,
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

  async setTorrentSearched(slug: string): Promise<void> {
    await this.movieModel.update(
      { sourcesSearched: true },
      { where: { slug } }
    );
  }

  async setSourceFound(slug: string): Promise<void> {
    await this.movieModel.update({ sourceFound: true }, { where: { slug } });
  }

  async setNoSourceFound(slug: string): Promise<void> {
    await this.movieModel.update({ noSourceFound: true }, { where: { slug } });
  }
}

@Global()
@Module({
  imports: [SequelizeModule.forFeature([Movie, Torrent, MovieSource])],
  providers: [MoviesData],
  exports: [MoviesData, SequelizeModule],
})
export class MoviesDataModule {}
