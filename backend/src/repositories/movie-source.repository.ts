import type { Source } from '@miauflix/source-metadata-extractor';
import { In, LessThan, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { MovieSource, QUALITIES } from '@entities/movie-source.entity';

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

const THREED_QUALITY_INDEX = QUALITIES.indexOf('3D');

export type SourceProcessingResult = Omit<MovieSource, 'movie'> & SourceToProcessMetadata;

interface SourceToProcessMetadata {
  id: number;
  total_src: number;
  done_src: number;
  completion_ratio: number;
  is_playable: number;
  within_movie_rank: number;
}

export class MovieSourceRepository {
  private readonly movieSourceRepository: Repository<MovieSource>;

  constructor(db: Database) {
    this.movieSourceRepository = db.getRepository(MovieSource);
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
  async create(source: Partial<MovieSource>): Promise<MovieSource> {
    if (source.movieId && source.hash) {
      const existing = await this.findByMovieAndHash(source.movieId, source.hash);
      if (existing) {
        const {
          quality: existingQuality,
          size: existingSize,
          videoCodec: existingVideoCodec,
          source: existingSource,
          sourceType: existingSourceType,
        } = existing;
        const { quality, size, videoCodec, source: srcSource, sourceType } = source;
        const isDuplicate =
          existingQuality === quality &&
          existingSize === size &&
          existingVideoCodec === videoCodec &&
          existingSource === srcSource &&
          existingSourceType === sourceType;
        if (!isDuplicate) {
          console.warn(
            `[MovieSourceRepository] Duplicate (movieId, hash) with differing data: movieId=${source.movieId}, hash=${source.hash}, existing=${JSON.stringify({ quality: existingQuality, size: existingSize, videoCodec: existingVideoCodec, source: existingSource, sourceType: existingSourceType })}, incoming=${JSON.stringify({ quality, size, videoCodec, source: srcSource, sourceType })}`
          );
        }
        return existing;
      }
    }
    const newSource = this.movieSourceRepository.create(source);
    return this.movieSourceRepository.save(newSource);
  }

  /**
   * Create multiple movie sources at once
   */
  async createMany(sources: Partial<MovieSource>[]): Promise<MovieSource[]> {
    const results: MovieSource[] = [];
    for (const source of sources) {
      if (source.movieId && source.hash) {
        const existing = await this.findByMovieAndHash(source.movieId, source.hash);
        if (existing) {
          const {
            quality: existingQuality,
            size: existingSize,
            videoCodec: existingVideoCodec,
            source: existingSource,
            sourceType: existingSourceType,
          } = existing;
          const { quality, size, videoCodec, source: srcSource, sourceType } = source;
          const isDuplicate =
            existingQuality === quality &&
            existingSize === size &&
            existingVideoCodec === videoCodec &&
            existingSource === srcSource &&
            existingSourceType === sourceType;
          if (!isDuplicate) {
            console.warn(
              `[MovieSourceRepository] Duplicate (movieId, hash) with differing data: movieId=${source.movieId}, hash=${source.hash}, existing=${JSON.stringify({ quality: existingQuality, size: existingSize, videoCodec: existingVideoCodec, source: existingSource, sourceType: existingSourceType })}, incoming=${JSON.stringify({ quality, size, videoCodec, source: srcSource, sourceType })}`
            );
          }
          results.push(existing);
          continue;
        }
      }
      const newSource = this.movieSourceRepository.create(source);
      const saved = await this.movieSourceRepository.save(newSource);
      results.push(saved);
    }
    return results;
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
  deleteByMovieId(movieId: number) {
    return this.movieSourceRepository.delete({ movieId });
  }

  /**
   * Update a movie source with source file data
   */
  updateSourceFile(sourceId: number, sourceFile: Buffer) {
    return this.movieSourceRepository.update(sourceId, {
      file: sourceFile,
      magnetLink: '', // This information is now in the source file we can clear it
      url: '', // We are not going to download it twice, we can clear it
    });
  }

  updateStats(sourceId: number, broadcasters: number, watchers: number, nextStatsCheckAt: Date) {
    return this.movieSourceRepository.update(sourceId, {
      broadcasters,
      watchers,
      lastStatsCheck: new Date(),
      nextStatsCheckAt,
    });
  }

  findSourceThatNeedsStatsUpdate(batchSize: number): Promise<MovieSource[]> {
    return this.movieSourceRepository.find({
      where: {
        nextStatsCheckAt: LessThan(new Date(Date.now())),
      },
      order: {
        nextStatsCheckAt: 'ASC',
      },
      take: batchSize,
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
      .andWhere(`ms.quality != ${THREED_QUALITY_INDEX}`)
      .addSelect(playabilityExpr, 'isPlayable')
      .setParameters({
        minBroadcastersPerGb: MIN_BROADCASTERS_PER_GB,
        minBroadcasterWatcherRatio: MIN_BROADCASTER_WATCHER_RATIO,
      })
      .orderBy('isPlayable', 'DESC') // prioritize streams that won't buffer
      .addOrderBy('ms.quality', 'DESC') // higher quality preferred
      .addOrderBy('ms.broadcasters', 'DESC') // more broadcasters = more reliable
      .addOrderBy('ms.size', 'ASC') // smaller file size preferred
      .limit(1)
      .getOne();
  }

  /**
   * Get next batch of sources that need link processing
   */
  async getNextSourcesToProcess(
    batchSize = 50,
    minBrPerGb = 20,
    minBcWcRatio = 1.0
  ): Promise<SourceProcessingResult[]> {
    const rawRows: SourceToProcessMetadata[] = await this.movieSourceRepository.query(
      `
WITH params(min_broadcasters_per_gb , min_bc_wc_ratio) AS (VALUES (?, ?)),
movie_progress AS (
  SELECT
    movieId,
    COUNT(*)                     AS total_src,
    SUM(file IS NOT NULL)        AS done_src
  FROM movie_source
  GROUP BY movieId
),
ranked AS (
  SELECT
    ms.id,                       -- keep only PK here
    ms.movieId,
    mp.total_src,
    mp.done_src,
    1.0 * mp.done_src / mp.total_src AS completion_ratio,
    CASE
      WHEN ms.broadcasters IS NULL OR ms.broadcasters = 0 THEN 0
      WHEN ms.size IS NULL        OR ms.size        = 0 THEN 0
      WHEN (1.0 * ms.broadcasters * 1000000000.0) / ms.size
           < (SELECT min_broadcasters_per_gb FROM params)      THEN 0
      WHEN ms.watchers IS NOT NULL AND ms.watchers > 0 AND
           (1.0 * ms.broadcasters) / ms.watchers
           < (SELECT min_bc_wc_ratio FROM params)              THEN 0
      ELSE 1
    END AS is_playable,
    ROW_NUMBER() OVER (
      PARTITION BY ms.movieId
      ORDER BY
        CASE
          WHEN ms.broadcasters IS NULL OR ms.broadcasters = 0 THEN 0
          WHEN ms.size IS NULL        OR ms.size        = 0 THEN 0
          WHEN (1.0 * ms.broadcasters * 1000000000.0) / ms.size
            < (SELECT min_broadcasters_per_gb FROM params)    THEN 0
          WHEN ms.watchers IS NOT NULL AND ms.watchers > 0 AND
            (1.0 * ms.broadcasters) / ms.watchers
              < (SELECT min_bc_wc_ratio FROM params)          THEN 0
          ELSE 1
        END DESC,
        ms.quality   DESC,
        ms.broadcasters DESC,
        ms.size         ASC
    ) AS within_movie_rank
  FROM movie_source ms
  JOIN movie_progress mp USING (movieId)
  WHERE ms.file IS NULL
    AND ms.quality != ${THREED_QUALITY_INDEX}
)
SELECT *
FROM ranked
ORDER BY
  within_movie_rank ASC,
  completion_ratio  ASC,
  is_playable       DESC
LIMIT ?
`,
      [minBrPerGb, minBcWcRatio, batchSize]
    );

    /* === 2. Hydrate entities (runs all transformers) ============== */
    const ids = rawRows.map((r: SourceToProcessMetadata) => r.id);
    const entities = await this.movieSourceRepository.find({ where: { id: In(ids) } });
    const entityById = new Map<number, MovieSource>(entities.map(e => [e.id, e]));

    /* === 3. Merge & keep original order =========================== */
    const merged: (MovieSource & SourceToProcessMetadata)[] = rawRows.map(
      (r: SourceToProcessMetadata) => {
        const base = entityById.get(r.id)!; // transformers applied
        return {
          ...base,
          total_src: r.total_src,
          done_src: r.done_src,
          completion_ratio: r.completion_ratio,
          is_playable: r.is_playable,
          within_movie_rank: r.within_movie_rank,
        };
      }
    );

    return merged;
  }

  /**
   * Update source metadata (sourceType and sourceUploadedAt)
   */
  updateSourceMetadata(
    sourceId: number,
    updateData: { sourceType?: Source | null; sourceUploadedAt?: Date }
  ) {
    return this.movieSourceRepository.update(sourceId, updateData);
  }

  /**
   * Calculate streaming score for a movie source (0-10,000 scale)
   * Components: Availability (4000) + Quality (3000) + Codec (2000) + Activity (1000) * AgePenalty
   */
  calculateStreamingScore(source: MovieSource): number {
    // Availability Score (4000 points max)
    let availabilityScore = 0;
    if (source.broadcasters && source.broadcasters > 0) {
      if (!source.watchers || source.watchers === 0) {
        availabilityScore = Math.min(4000, source.broadcasters * 40); // Cap at 4000
      } else {
        const ratio = source.broadcasters / source.watchers;
        availabilityScore = Math.min(4000, (source.broadcasters * 30 + ratio * 100) * 1.33);
      }
    }

    // Quality Score (3000 points max)
    const qualityScores: Record<number, number> = {
      0: 500, // SD = 500 points
      1: 1500, // HD = 1500 points
      2: 2500, // FHD = 2500 points
      3: 3000, // 2K = 3000 points
      4: 3500, // 4K = 3500 points (will be capped)
      5: 4000, // 8K = 4000 points (will be capped)
      6: 0, // 3D = 0 points
      // Note: 3D (index 6) is filtered out in queries
    };
    const qualityIndex = source.quality !== null ? Number(source.quality) : -1;
    const qualityScore = Math.min(3000, qualityScores[qualityIndex] || 1000);

    // Codec Efficiency Score (2000 points max)
    const codecScores: Record<number, number> = {
      0: 200, // VC1 = 200 points
      1: 400, // MPEG2 = 400 points
      2: 800, // MPEG4 = 800 points
      3: 600, // XVID = 600 points
      4: 1200, // VP8 = 1200 points
      5: 1500, // VP9 = 1500 points
      6: 1800, // X264 = 1800 points
      7: 2200, // X265 = 2200 points (will be capped)
      8: 2500, // AV1 = 2500 points (will be capped)
      9: 2000, // X264_10BIT = 2000 points
      10: 2800, // X265_10BIT = 2800 points (will be capped)
      11: 3000, // AV1_10BIT = 3000 points (will be capped)
    };
    const codecIndex = source.videoCodec !== null ? Number(source.videoCodec) : -1;
    const codecScore = Math.min(2000, codecScores[codecIndex] || 1000);

    // Activity Score (1000 points max)
    const totalActivity = (source.broadcasters || 0) + (source.watchers || 0);
    const activityScore = Math.min(1000, totalActivity * 10); // 1 point per peer

    // Age Penalty Multiplier
    let agePenalty = 0.9; // Default for unknown age
    if (source.sourceUploadedAt) {
      const now = new Date();
      const uploadDate = new Date(source.sourceUploadedAt);
      const yearsOld = (now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

      if (yearsOld < 1)
        agePenalty = 1.0; // Recent = full score
      else if (yearsOld < 2)
        agePenalty = 0.85; // 1-2 years = 85%
      else agePenalty = 0.7; // 2+ years = 70%
    }

    const totalScore = (availabilityScore + qualityScore + codecScore + activityScore) * agePenalty;
    return Math.round(totalScore);
  }
}
