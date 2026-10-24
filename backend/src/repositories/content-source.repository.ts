import type { Source } from '@miauflix/source-metadata-extractor';
import { In, LessThan, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { ContentSource, QUALITIES } from '@entities/content-source.entity';
import { MovieSource } from '@entities/movie-source.entity';

const THREED_QUALITY_INDEX = QUALITIES.indexOf('3D');

export type SourceProcessingResult = ContentSource & SourceToProcessMetadata;

interface SourceToProcessMetadata {
  id: number;
  total_src: number;
  done_src: number;
  completion_ratio: number;
  is_playable: number;
  within_movie_rank: number;
}

/** Provider fields refreshed when a known source is reported again. */
const PROVIDER_FIELDS = [
  'magnetLink',
  'url',
  'quality',
  'size',
  'videoCodec',
  'source',
  'sourceType',
  'sourceUploadedAt',
] as const satisfies ReadonlyArray<keyof ContentSource>;

export type ContentSourceInput = Partial<ContentSource> & Pick<ContentSource, 'hash'>;

export class ContentSourceRepository {
  private readonly repository: Repository<ContentSource>;
  private readonly movieSources: Repository<MovieSource>;

  constructor(private readonly db: Database) {
    this.repository = db.getRepository(ContentSource);
    this.movieSources = db.getRepository(MovieSource);
  }

  /**
   * Find all sources linked to a specific movie
   */
  findByMovieId(movieId: number): Promise<ContentSource[]> {
    return this.repository
      .createQueryBuilder('cs')
      .innerJoin(MovieSource, 'ms', 'ms.sourceId = cs.id')
      .where('ms.movieId = :movieId', { movieId })
      .getMany();
  }

  /** True when the source is linked to the movie, used to authorize movie playback grants. */
  isLinkedToMovie(movieId: number, sourceId: number): Promise<boolean> {
    return this.movieSources.exists({ where: { movieId, sourceId } });
  }

  /**
   * Insert a source or refresh the provider metadata of the existing row with the same hash.
   * The unique hash index makes concurrent calls converge on one row. On SQLite `orIgnore`
   * emits `ON CONFLICT DO NOTHING`, which only covers uniqueness conflicts; NOT NULL and
   * other constraint violations still throw.
   */
  async upsertByHash(source: ContentSourceInput): Promise<ContentSource> {
    await this.db.write(() =>
      this.repository
        .createQueryBuilder()
        .insert()
        .into(ContentSource)
        .values(source)
        .orIgnore()
        .execute()
    );
    // The `ih` transformer normalizes the hash, so any casing finds the canonical row.
    const existing = await this.repository.findOne({ where: { hash: source.hash } });
    if (!existing) throw new Error('Content source could not be stored');
    const changes = this.providerMetadataChanges(existing, source);
    if (!changes) return existing;
    await this.repository.update(existing.id, changes);
    return Object.assign(existing, changes);
  }

  /** Upsert provider sources and link each one to the movie. */
  async upsertForMovie(movieId: number, sources: ContentSourceInput[]): Promise<ContentSource[]> {
    const results: ContentSource[] = [];
    for (const source of sources) {
      const stored = await this.upsertByHash(source);
      await this.linkMovie(movieId, stored.id);
      results.push(stored);
    }
    return results;
  }

  /** The movie's main video inside the source, if it has been resolved. */
  async findMovieVideoFilePath(movieId: number, sourceId: number): Promise<string | null> {
    const link = await this.movieSources.findOne({ where: { movieId, sourceId } });
    return link?.videoFilePath ?? null;
  }

  /**
   * Record the movie's main video inside the source. The first writer wins, so concurrent
   * resolutions agree; returns the stored path.
   */
  async setMovieVideoFilePath(
    movieId: number,
    sourceId: number,
    videoFilePath: string
  ): Promise<string> {
    await this.db.write(() =>
      this.movieSources
        .createQueryBuilder()
        .update(MovieSource)
        .set({ videoFilePath })
        .where('movieId = :movieId AND sourceId = :sourceId AND videoFilePath IS NULL', {
          movieId,
          sourceId,
        })
        .execute()
    );
    return (await this.findMovieVideoFilePath(movieId, sourceId)) ?? videoFilePath;
  }

  async linkMovie(movieId: number, sourceId: number): Promise<void> {
    await this.db.write(() =>
      this.movieSources
        .createQueryBuilder()
        .insert()
        .into(MovieSource)
        .values({ movieId, sourceId, videoFilePath: null })
        .orIgnore()
        .execute()
    );
  }

  private providerMetadataChanges(
    existing: ContentSource,
    source: Partial<ContentSource>
  ): Partial<ContentSource> | null {
    const changes: Partial<Record<(typeof PROVIDER_FIELDS)[number], unknown>> = {};
    for (const field of PROVIDER_FIELDS) {
      const value = source[field];
      if (value === undefined) continue;
      const current = existing[field];
      const same =
        value instanceof Date && current instanceof Date
          ? value.getTime() === current.getTime()
          : value === current;
      if (!same) changes[field] = value;
    }
    return Object.keys(changes).length ? (changes as Partial<ContentSource>) : null;
  }

  /**
   * Update a movie source with source file data
   */
  updateSourceFile(sourceId: number, sourceFile: Buffer) {
    return this.repository.update(sourceId, {
      file: sourceFile,
      magnetLink: '', // This information is now in the source file we can clear it
      url: '', // We are not going to download it twice, we can clear it
    });
  }

  updateStats(sourceId: number, broadcasters: number, watchers: number, nextStatsCheckAt: Date) {
    return this.repository.update(sourceId, {
      broadcasters,
      watchers,
      lastStatsCheck: new Date(),
      nextStatsCheckAt,
    });
  }

  findSourceThatNeedsStatsUpdate(batchSize: number): Promise<ContentSource[]> {
    return this.repository.find({
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
  findById(sourceId: number): Promise<ContentSource | null> {
    return this.repository.findOne({ where: { id: sourceId } });
  }

  /**
   * Get next batch of sources that need link processing
   */
  async getNextSourcesToProcess(
    batchSize = 50,
    minBrPerGb = 20,
    minBcWcRatio = 1.0
  ): Promise<SourceProcessingResult[]> {
    const rawRows: SourceToProcessMetadata[] = await this.repository.query(
      `
WITH params(min_broadcasters_per_gb , min_bc_wc_ratio) AS (VALUES (?, ?)),
movie_progress AS (
  SELECT
    ms.movieId,
    COUNT(*)                     AS total_src,
    SUM(cs.file IS NOT NULL)     AS done_src
  FROM movie_source ms
  JOIN content_source cs ON cs.id = ms.sourceId
  GROUP BY ms.movieId
),
ranked AS (
  SELECT
    cs.id,                       -- keep only PK here
    ms.movieId,
    mp.total_src,
    mp.done_src,
    1.0 * mp.done_src / mp.total_src AS completion_ratio,
    CASE
      WHEN cs.broadcasters IS NULL OR cs.broadcasters = 0 THEN 0
      WHEN cs.size IS NULL        OR cs.size        = 0 THEN 0
      WHEN (1.0 * cs.broadcasters * 1000000000.0) / cs.size
           < (SELECT min_broadcasters_per_gb FROM params)      THEN 0
      WHEN cs.watchers IS NOT NULL AND cs.watchers > 0 AND
           (1.0 * cs.broadcasters) / cs.watchers
           < (SELECT min_bc_wc_ratio FROM params)              THEN 0
      ELSE 1
    END AS is_playable,
    ROW_NUMBER() OVER (
      PARTITION BY ms.movieId
      ORDER BY
        CASE
          WHEN cs.broadcasters IS NULL OR cs.broadcasters = 0 THEN 0
          WHEN cs.size IS NULL        OR cs.size        = 0 THEN 0
          WHEN (1.0 * cs.broadcasters * 1000000000.0) / cs.size
            < (SELECT min_broadcasters_per_gb FROM params)    THEN 0
          WHEN cs.watchers IS NOT NULL AND cs.watchers > 0 AND
            (1.0 * cs.broadcasters) / cs.watchers
              < (SELECT min_bc_wc_ratio FROM params)          THEN 0
          ELSE 1
        END DESC,
        cs.quality   DESC,
        cs.broadcasters DESC,
        cs.size         ASC
    ) AS within_movie_rank
  FROM content_source cs
  JOIN movie_source ms ON ms.sourceId = cs.id
  JOIN movie_progress mp ON mp.movieId = ms.movieId
  WHERE cs.file IS NULL
    AND cs.quality != ${THREED_QUALITY_INDEX}
),
-- A source shared by several movies keeps only its most urgent ranking.
deduped AS (
  SELECT
    ranked.*,
    ROW_NUMBER() OVER (
      PARTITION BY id
      ORDER BY within_movie_rank ASC, completion_ratio ASC
    ) AS duplicate_rank
  FROM ranked
)
SELECT id, total_src, done_src, completion_ratio, is_playable, within_movie_rank
FROM deduped
WHERE duplicate_rank = 1
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
    const entities = await this.repository.find({ where: { id: In(ids) } });
    const entityById = new Map<number, ContentSource>(entities.map(e => [e.id, e]));

    /* === 3. Merge & keep original order =========================== */
    const merged: (ContentSource & SourceToProcessMetadata)[] = rawRows.map(
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
    return this.repository.update(sourceId, updateData);
  }

  /**
   * Calculate streaming score for a movie source (0-10,000 scale)
   * Components: Availability (4000) + Quality (3000) + Codec (2000) + Activity (1000) * AgePenalty
   */
  calculateStreamingScore(source: ContentSource): number {
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
