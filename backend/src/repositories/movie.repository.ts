import type { Repository } from 'typeorm';
import { And, In, IsNull, LessThanOrEqual, Not } from 'typeorm';

import type { Database } from '@database/database';
import type { Genre } from '@entities/genre.entity';
import { Movie, MovieTranslation } from '@entities/movie.entity';
import { type MovieSource } from '@entities/movie-source.entity';
import { objectKeys } from '@utils/object.util';

export class MovieRepository {
  private readonly movieRepository: Repository<Movie>;
  private readonly movieTranslationRepository: Repository<MovieTranslation>;

  constructor(db: Database) {
    this.movieRepository = db.getRepository(Movie);
    this.movieTranslationRepository = db.getRepository(MovieTranslation);
  }

  async findByIds(ids: number[]): Promise<Movie[]> {
    return this.movieRepository.findBy({ id: In(ids) });
  }

  async findByTMDBId(tmdbId: number): Promise<Movie | null> {
    return this.movieRepository.findOne({ where: { tmdbId } });
  }

  async create(movie: Partial<Movie>): Promise<Movie> {
    const newMovie = this.movieRepository.create(movie);
    const result = await this.movieRepository.upsert(newMovie, ['imdbId']);
    if (!result.identifiers.length) {
      throw new Error('Failed to create movie');
    }
    const id = result.identifiers[0].id;
    const updatedMovie = await this.movieRepository.findOneBy(
      movie.imdbId ? { imdbId: movie.imdbId } : movie.tmdbId ? { tmdbId: movie.tmdbId } : { id }
    );
    if (!updatedMovie) {
      console.log(
        {
          result,
          movie,
          where: movie.imdbId
            ? { imdbId: movie.imdbId }
            : movie.tmdbId
              ? { tmdbId: movie.tmdbId }
              : { id },
        },
        result
      );
      throw new Error('Failed to retrieve created movie');
    }
    return updatedMovie;
  }

  async addTranslation(movie: Movie, translation: Partial<MovieTranslation>) {
    if (!movie.id) {
      throw new Error('Movie ID is required to add a translation');
    }
    const newTranslation = this.movieTranslationRepository.create({
      ...translation,
      movie,
    });
    await this.movieTranslationRepository.upsert(newTranslation, ['movieId', 'language']);
  }

  async checkForChangesAndUpdate(
    movie: Movie,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { genres: _, ...updatedMovie }: Partial<Movie>
  ): Promise<void> {
    const hasChanges = objectKeys(updatedMovie).some(key => {
      return movie[key] !== updatedMovie[key];
    });
    if (hasChanges) {
      await this.movieRepository.update(movie.id, updatedMovie);
    }
  }

  async updateGenres(movie: Movie, genres: Genre[]): Promise<void> {
    const updatedMovie = await this.movieRepository.findOneBy({
      id: movie.id,
    });
    if (!updatedMovie) {
      throw new Error('Movie not found');
    }
    updatedMovie.genres = genres;
    await this.movieRepository.save(updatedMovie);
  }

  /**
   * Find movies that haven't been searched for sources yet
   */
  async findMoviesPendingSourceSearch(limit: number = 10): Promise<Movie[]> {
    // Find movies where no directories have been searched
    return this.movieRepository.find({
      where: {
        imdbId: And(Not(IsNull()), Not('')),
        contentDirectoriesSearched: '[]',
        nextSourceSearchAt: LessThanOrEqual(new Date()),
      },
      order: { popularity: 'DESC' },
      take: limit,
    });
  }

  async findMoviesWithoutSources(limit: number = 10): Promise<
    (Omit<Movie, 'sources'> & {
      sources: MovieSource[];
      sourcesCount: number;
      missingCount: number;
    })[]
  > {
    // Get movies that have sources without source files
    // This query prioritizes movies based on:
    // - Movie popularity
    // - Number of sources for the movie
    // - Number of sources with missing source files

    // First, find movie IDs with their source counts and missing source counts
    const results = await this.movieRepository
      .createQueryBuilder('movie')
      .innerJoin('movie.sources', 'source')
      .select('movie.id', 'id')
      .addSelect('movie.popularity', 'popularity')
      .addSelect('COUNT(source.id)', 'sources')
      .addSelect('SUM(CASE WHEN source.file IS NULL THEN 1 ELSE 0 END)', 'missing')
      .where('movie.sourceSearched = true')
      .groupBy('movie.id')
      .addGroupBy('movie.popularity')
      .having('SUM(CASE WHEN source.file IS NULL THEN 1 ELSE 0 END) > 0')
      .orderBy('"missing"/"sources"', 'DESC')
      .addOrderBy('movie.popularity', 'DESC')
      .limit(limit)
      .getRawMany<{ id: number; popularity: number; sources: number; missing: number }>();

    if (results.length === 0) {
      return [];
    }

    // Map the results to Movie entities
    const movieIds = results.map(result => result.id);
    const movies = await this.movieRepository.find({
      where: {
        id: In(movieIds),
      },
      relations: {
        sources: true,
      },
    });

    return movies.map(movie => {
      const result = results.find(r => r.id === movie.id) || { sources: 0, missing: 0 };
      return {
        ...movie,
        sourcesCount: result.sources,
        missingCount: result.missing,
      };
    });
  }

  /**
   * Mark a movie as having been searched for sources ( successfully )
   * @param movieId - The ID of the movie to mark
   * @param directory - The directory that was searched
   */
  async markSourceSearched(movieId: number, directory: string): Promise<void> {
    // Fetch the movie
    const movie = await this.movieRepository.findOneBy({ id: movieId });
    if (!movie) return;
    // Initialize array if missing
    if (!Array.isArray(movie.contentDirectoriesSearched)) {
      movie.contentDirectoriesSearched = [];
    }
    // Add directory if not present
    if (!movie.contentDirectoriesSearched.includes(directory)) {
      movie.contentDirectoriesSearched.push(directory);
      await this.movieRepository.save(movie);
    }
  }

  /**
   * Mark a movie as having been attempted to search for sources ( unsuccessfully )
   * @param movieId - The ID of the movie to mark
   */
  async markSourceSearchAttempt(movieId: number): Promise<void> {
    const backoffMs = (45 + Math.random() * 30) * 60 * 1000; // 45-75 minutes
    const nextSearch = new Date(Date.now() + backoffMs);
    await this.movieRepository.update(movieId, { nextSourceSearchAt: nextSearch });
  }

  /**
   * Update movie trailer if it doesn't already exist
   */
  async updateMovieTrailerIfDoesntExists(movieId: number, trailerCode: string): Promise<void> {
    await this.movieRepository.update(
      {
        id: movieId,
        trailer: IsNull(),
      },
      {
        trailer: trailerCode,
      }
    );
  }

  async saveMovie(movie: Movie): Promise<Movie> {
    return this.movieRepository.save(movie);
  }

  /**
   * Find movies by IDs that have IMDb IDs, ordered by popularity
   */
  async findMoviesByIdsWithImdb(movieIds: number[], limit: number = 10): Promise<Movie[]> {
    if (movieIds.length === 0) {
      return [];
    }

    return this.movieRepository.find({
      where: {
        id: In(movieIds),
        imdbId: Not(IsNull()),
      },
      order: {
        popularity: 'DESC',
      },
      take: limit,
    });
  }
}
