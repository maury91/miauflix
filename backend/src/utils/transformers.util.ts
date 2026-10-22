import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import type { ContentSource } from '@entities/content-source.entity';

/**
 * Utility functions for transforming data between formats
 */

type ProviderSourceRow = Omit<
  ContentSource,
  'createdAt' | 'episodes' | 'id' | 'movies' | 'updatedAt'
>;

/** Info hashes are case-insensitive hex; the `ih` column stores this canonical form. */
export const normalizeInfoHash = (hash: string): string => hash.trim().toLowerCase();

/**
 * Transform a provider source to a database entity format
 */
export const providerSourceToEntity = (
  providerSource: SourceMetadata,
  providerName: string
): ProviderSourceRow => ({
  hash: providerSource.hash,
  magnetLink: providerSource.magnetLink,
  quality: providerSource.quality,
  size: providerSource.size,
  videoCodec: providerSource.videoCodec,
  broadcasters: providerSource.broadcasters,
  watchers: providerSource.watchers,
  sourceUploadedAt: providerSource.uploadDate,
  url: providerSource.url,
  source: providerName,
  sourceType: providerSource.source,
  nextStatsCheckAt: new Date(),
  streamingScore: 0, // TODO: calculate streaming score
});

/**
 * Transform multiple provider sources to database entity format
 */
export const providerSourcesToEntities = (
  sources: SourceMetadata[],
  providerName: string
): ProviderSourceRow[] => {
  return sources.map(source => providerSourceToEntity(source, providerName));
};
