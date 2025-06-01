import type { Repository } from 'typeorm';

import type { MovieSource } from '@entities/movie.entity';
import type { Database } from '@database/database';

/* ------------------------------------------------------------------------- */
/* REUSABLE CONSTANTS & SQL SNIPPET                                         */
/* ------------------------------------------------------------------------- */
const MIN_BROADCASTERS_PER_GB = 20; // minimum broadcasters per GB for smooth streaming
const MIN_BROADCASTER_WATCHER_RATIO = 1.0; // minimum ratio for good streaming quality

/** SQL fragment that evaluates to 0/1 = "does this file stream smoothly?" */
const playabilityExpr = `
CASE
  WHEN ms.broadcasters IS NULL OR ms.size IS NULL OR ms.broadcasters = 0 OR ms.size = 0
       THEN 0
  WHEN (1.0 * ms.broadcasters * 1000000000.0) / ms.size < :minBroadcastersPerGb
       THEN 0
  WHEN ms.watchers IS NOT NULL AND ms.watchers > 0
       AND (1.0 * ms.broadcasters) / ms.watchers < :minBroadcasterWatcherRatio
       THEN 0
  ELSE 1
END
`;

// export interface MovieSource extends Omit<MovieSourceEntity, 'file' | 'ih' | 'ml'> {
//   hash: string;
//   magnetLink: string;
//   torrentFile?: Buffer; // Optional torrent file data
// }

export interface SourceProcessingResult {
  id: number;
  movieId: number;
  isPlayable: number;
  total_src: number;
  linked_src: number;
  completion_ratio: number;
  rn_best_missing: number;
}

export class MovieSourceRepository {
  private readonly movieSourceRepository: Repository<MovieSource>;

  constructor(db: Database) {
    this.movieSourceRepository = db.getRepository(db.MovieSource);
  }

  /**
   * Get the underlying TypeORM repository for advanced queries
   */
  getRepository(): Repository<MovieSource> {
    return this.movieSourceRepository;
  }

  /**
   * Find all sources for a specific movie
   */
  findByMovieId(movieId: number): Promise<MovieSource[]> {
    return this.movieSourceRepository.find({ where: { movieId } });
  }

  /**
   * Create a new movie source
   */
  create(source: Partial<MovieSource>): Promise<MovieSource> {
    const newSource = this.movieSourceRepository.create(source);
    return this.movieSourceRepository.save(newSource);
  }

  /**
   * Create multiple movie sources at once
   */
  createMany(sources: Partial<MovieSource>[]): Promise<MovieSource[]> {
    const newSources = sources.map(source => this.movieSourceRepository.create(source));
    return this.movieSourceRepository.save(newSources);
  }

  /**
   * Find a source by hash for a specific movie
   */
  findByMovieAndHash(movieId: number, hash: string): Promise<MovieSource | null> {
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

  /**
   * Update a movie source with torrent file data
   */
  async updateTorrentFile(sourceId: number, torrentFile: Buffer): Promise<void> {
    await this.movieSourceRepository.update(sourceId, {
      file: torrentFile,
    });
  }

  /**
   * Find a movie source by its ID
   */
  findById(sourceId: number): Promise<MovieSource | null> {
    return this.movieSourceRepository.findOne({ where: { id: sourceId } });
  }

  /**
   * Save an existing movie source (used by migration)
   */
  save(source: MovieSource): Promise<MovieSource> {
    return this.movieSourceRepository.save(source);
  }

  /**
   * Find all sources (used by migration)
   */
  findAll(): Promise<MovieSource[]> {
    return this.movieSourceRepository.find();
  }

  /**
   * Get the best source for a specific movie based on playability and quality
   */
  async getBestSource(movieId: number): Promise<MovieSource | null> {
    return this.movieSourceRepository
      .createQueryBuilder('ms')
      .where('ms.movieId = :movieId', { movieId })
      .addSelect(playabilityExpr, 'isPlayable')
      .setParameters({
        minBroadcastersPerGb: MIN_BROADCASTERS_PER_GB,
        minBroadcasterWatcherRatio: MIN_BROADCASTER_WATCHER_RATIO,
      })
      .orderBy('isPlayable', 'DESC') // prioritize streams that won't buffer
      .addOrderBy('ms.resolution', 'DESC') // higher resolution preferred
      .addOrderBy('ms.broadcasters', 'DESC') // more broadcasters = more reliable
      .addOrderBy('ms.size', 'ASC') // smaller file size preferred
      .limit(1)
      .getOne();
  }

  /**
   * Get next batch of sources that need link processing
   */
  async getNextSourcesToProcess(batchSize = 1): Promise<SourceProcessingResult[]> {
    const repo = this.movieSourceRepository;

    // Sub-query: overall link-fetch progress per film
    const completionQb = repo
      .createQueryBuilder('ms2')
      .select('ms2.movieId', 'movieId')
      .addSelect('COUNT(*)', 'total_src')
      .addSelect('SUM(CASE WHEN ms2.file IS NOT NULL THEN 1 ELSE 0 END)', 'linked_src')
      .groupBy('ms2.movieId');

    // Main query
    return repo
      .createQueryBuilder('ms')
      .innerJoin('(' + completionQb.getQuery() + ')', 'c', 'c.movieId = ms.movieId')
      .addSelect(playabilityExpr, 'isPlayable')
      .addSelect('c.total_src', 'total_src')
      .addSelect('c.linked_src', 'linked_src')
      .addSelect('(1.0 * c.linked_src) / c.total_src', 'completion_ratio')
      .addSelect(
        `ROW_NUMBER() OVER (
           PARTITION BY ms.movieId
           ORDER BY
             ${playabilityExpr} DESC,
             ms.resolution      DESC,
             ms.broadcasters    DESC,
             ms.size            ASC
         )`,
        'rn_best_missing'
      )
      .setParameters({
        minBroadcastersPerGb: MIN_BROADCASTERS_PER_GB,
        minBroadcasterWatcherRatio: MIN_BROADCASTER_WATCHER_RATIO,
        ...completionQb.getParameters(),
      })
      .where('ms.file IS NULL') // still needs torrent file fetching
      .andWhere('c.linked_src BETWEEN 1 AND c.total_src - 1') // skip 0% / 100% completion
      .having('rn_best_missing = 1') // best missing source per film
      .orderBy('completion_ratio', 'ASC') // least-complete movie first
      .addOrderBy('isPlayable', 'DESC')
      .addOrderBy('ms.broadcasters', 'DESC')
      .limit(batchSize)
      .getRawMany();
  }
}
