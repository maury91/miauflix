import type { DataSource, Repository } from 'typeorm';

import { MovieSource } from '@entities/movie-source.entity';

export class MovieSourceRepository {
  private readonly movieSourceRepository: Repository<MovieSource>;

  constructor(datasource: DataSource) {
    this.movieSourceRepository = datasource.getRepository(MovieSource);
  }

  /**
   * Find all sources for a specific movie
   */
  async findByMovieId(movieId: number): Promise<MovieSource[]> {
    return this.movieSourceRepository.find({ where: { movieId } });
  }

  /**
   * Create a new movie source
   */
  async create(source: Partial<MovieSource>): Promise<MovieSource> {
    const newSource = this.movieSourceRepository.create(source);
    return this.movieSourceRepository.save(newSource);
  }

  /**
   * Create multiple movie sources at once
   */
  async createMany(sources: Partial<MovieSource>[]): Promise<MovieSource[]> {
    const newSources = sources.map(source => this.movieSourceRepository.create(source));
    return this.movieSourceRepository.save(newSources);
  }

  /**
   * Find a source by hash for a specific movie
   */
  async findByMovieAndHash(movieId: number, hash: string): Promise<MovieSource | null> {
    return this.movieSourceRepository.findOne({
      where: {
        movieId,
        hash,
      },
    });
  }

  /**
   * Delete all sources for a movie
   */
  async deleteByMovieId(movieId: number): Promise<void> {
    await this.movieSourceRepository.delete({ movieId });
  }
}
