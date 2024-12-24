import { Global, Injectable, Module } from '@nestjs/common';
import {
  Movie,
  MovieCreationAttributes,
} from '../database/entities/movie.entity';
import { Movie as TraktMovie } from '../trakt/trakt.types';
import { MediaImages, MovieDto } from '@miauflix/types';
import { Torrent } from '../database/entities/torrent.entity';
import { MovieSource } from '../database/entities/movie.source.entity';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { movieToDto } from './movies.utils';

@Injectable()
export class MoviesData {
  constructor(
    @InjectRepository(Movie) private readonly movieModel: Repository<Movie>
  ) {}

  async findMovie(slug: string): Promise<Movie | null> {
    return await this.movieModel.findOne({
      where: {
        slug,
      },
    });
  }

  async updateImages(movieId: number, images: MediaImages): Promise<void> {
    await this.movieModel.update({ id: movieId }, images);
  }

  async findMovieById(id: number): Promise<Movie | null> {
    return await this.movieModel.findOneBy({ id });
  }

  async findMoviesWithoutImages(): Promise<Movie[]> {
    return await this.movieModel.find({
      where: [
        {
          poster: '',
        },
        {
          backdrops: Raw((alias) => `cardinality(${alias}) = 0`),
        },
      ],
    });
  }

  async findMovieWithSources(slug: string): Promise<Movie | null> {
    return await this.movieModel.findOne({
      where: {
        slug,
      },
      relations: {
        sources: true,
      },
    });
  }

  async findTraktMovie(slug: string): Promise<TraktMovie | null> {
    const movie = await this.movieModel.findOne({
      select: ['slug', 'traktId', 'imdbId', 'tmdbId', 'title', 'year'],
      where: {
        slug,
      },
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
    return await this.movieModel.find({
      where: {
        slug: In(slugs),
      },
    });
  }

  async findMoviesMap(slugs: string[]): Promise<Record<string, MovieDto>> {
    const storedMovies = await this.findMovies(slugs);
    return storedMovies.reduce<Record<string, MovieDto>>(
      (acc, movie) => ({
        ...acc,
        [movie.slug]: movieToDto(movie),
      }),
      {}
    );
  }

  async createMovie(movie: MovieCreationAttributes): Promise<Movie> {
    return await this.movieModel.save(movie);
  }

  async setTorrentSearched(slug: string): Promise<void> {
    await this.movieModel.update({ slug }, { sourcesSearched: true });
  }

  async setSourceFound(slug: string): Promise<void> {
    await this.movieModel.update({ slug }, { sourceFound: true });
  }

  async setNoSourceFound(slug: string): Promise<void> {
    await this.movieModel.update({ slug }, { noSourceFound: true });
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Movie, Torrent, MovieSource])],
  providers: [MoviesData],
  exports: [MoviesData, TypeOrmModule],
})
export class MoviesDataModule {}
