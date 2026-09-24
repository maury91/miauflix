import type { Repository } from 'typeorm';
import { And, In, IsNull, LessThanOrEqual, Not } from 'typeorm';

import type { Database } from '@database/database';
import { Movie } from '@entities/movie.entity';
import { type MovieSource } from '@entities/movie-source.entity';
import { RepositoryError } from '@errors/repository.errors';
import type { MovieDetail } from '@services/catalog/catalog.types';

/**
 * Local index of catalog movies. Catalog content is owned by the media-catalog
 * service; this repository only maintains the slim mirror the backend's own SQL
 * joins need (source discovery, streaming, ranking).
 */
export class MovieRepository {
  private readonly movieRepository: Repository<Movie>;

  constructor(private readonly database: Database) {
    this.movieRepository = database.getRepository(Movie);
  }

  async findByIds(ids: number[]): Promise<Movie[]> {
    return this.movieRepository.findBy({ id: In(ids) });
  }

  async findById(id: number): Promise<Movie | null> {
    return this.movieRepository.findOneBy({ id });
  }

  async findByMediaId(mediaId: number): Promise<Movie | null> {
    return this.movieRepository.findOneBy({ mediaId });
  }

  async findListItemsByMediaIds(mediaIds: number[]): Promise<Movie[]> {
    if (mediaIds.length === 0) return [];
    return this.movieRepository.find({
      where: { mediaId: In(mediaIds) },
    });
  }

  /** Lightweight lookup used by list refreshes; deliberately bypasses eager relations. */
  async findReferencesByMediaIds(
    mediaIds: number[]
  ): Promise<Array<Pick<Movie, 'id' | 'mediaId'>>> {
    if (mediaIds.length === 0) {
      return [];
    }
    return this.movieRepository
      .createQueryBuilder('movie')
      .select(['movie.id', 'movie.mediaId'])
      .where('movie.tmdbId IN (:...mediaIds)', { mediaIds })
      .getMany();
  }

  /** Mirrors a catalog movie detail into the local index (upsert by mediaId). */
  async upsertMovieDetail(detail: MovieDetail): Promise<Movie> {
    const created = this.movieRepository.create({
      backdrop: detail.backdrop,
      contentDirectoriesSearched: [],
      imdbId: detail.imdbId,
      overview: detail.overview,
      popularity: detail.popularity,
      poster: detail.poster,
      rating: detail.rating,
      releaseDate: detail.releaseDate,
      runtime: detail.runtime,
      title: detail.title,
      mediaId: detail.mediaId,
    });
    await this.database.write(() =>
      this.movieRepository
        .createQueryBuilder()
        .insert()
        .into(Movie)
        .values(created)
        .orUpdate(
          [
            'title',
            'overview',
            'popularity',
            'releaseDate',
            'poster',
            'backdrop',
            'runtime',
            'rating',
            'imdbId',
          ],
          // orUpdate expects database column names; the column predates the mediaId rename.
          ['tmdbId']
        )
        .updateEntity(false)
        .execute()
    );
    const stored = await this.movieRepository.findOneBy({ mediaId: detail.mediaId });
    if (!stored) {
      throw new RepositoryError('Failed to persist movie index entry', 'retrieve_failed');
    }
    return stored;
  }

  async updateFromSummary(mediaId: number, movie: Partial<Movie>): Promise<void> {
    await this.movieRepository.update({ mediaId }, movie);
  }

  async createFromSummary(movie: Partial<Movie>): Promise<Movie> {
    const created = this.movieRepository.create({
      backdrop: '',
      contentDirectoriesSearched: [],
      imdbId: null,
      overview: '',
      popularity: 0,
      poster: '',
      rating: 0,
      releaseDate: '',
      runtime: 0,
      title: '',
      ...movie,
    });
    await this.database.write(() =>
      this.movieRepository
        .createQueryBuilder()
        .insert()
        .into(Movie)
        .values(created)
        .orUpdate(
          ['title', 'overview', 'popularity', 'releaseDate', 'poster', 'backdrop'],
          // orUpdate expects database column names; the column predates the mediaId rename.
          ['tmdbId']
        )
        .updateEntity(false)
        .execute()
    );
    const stored = await this.movieRepository.findOneBy({ mediaId: created.mediaId });
    if (!stored) {
      throw new RepositoryError('Failed to persist movie summary', 'retrieve_failed');
    }
    return stored;
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

  async resetSourceSearchState(movieId: number): Promise<void> {
    await this.movieRepository.update(movieId, {
      contentDirectoriesSearched: [],
      nextSourceSearchAt: new Date(),
    });
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
