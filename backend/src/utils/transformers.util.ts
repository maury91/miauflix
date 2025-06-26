import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import type { MovieSource } from '@entities/movie-source.entity';

/**
 * Utility functions for transforming data between formats
 */

/**
 * Transform a provider source to a database entity format
 */
export const providerSourceToEntity = (
  providerSource: SourceMetadata,
  movieId: number,
  providerName: string
): Omit<MovieSource, 'createdAt' | 'id' | 'movie' | 'updatedAt'> => ({
  movieId,
  hash: providerSource.hash,
  magnetLink: providerSource.magnetLink,
  quality: providerSource.quality,
  resolution: providerSource.resolution.height,
  size: providerSource.size,
  videoCodec: providerSource.videoCodec?.toString() || '',
  broadcasters: providerSource.broadcasters,
  watchers: providerSource.watchers,
  sourceUploadedAt: providerSource.uploadDate,
  url: providerSource.url,
  source: providerName,
  sourceType: providerSource.source?.toString() || 'unknown',
  nextStatsCheckAt: new Date(),
});

/**
 * Transform multiple provider sources to database entity format
 */
export const providerSourcesToEntities = (
  sources: SourceMetadata[],
  movieId: number,
  providerName: string
): Omit<MovieSource, 'createdAt' | 'id' | 'movie' | 'updatedAt'>[] => {
  return sources.map(source => providerSourceToEntity(source, movieId, providerName));
};
