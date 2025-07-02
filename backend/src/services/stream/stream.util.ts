import { VideoCodec } from '@miauflix/source-metadata-extractor';

import type { MovieSource } from '@entities/movie-source.entity';

/**
 * Filter sources that can be streamed without delay
 *
 * @param sources - Array of movie sources to filter
 * @returns Filtered sources that can be streamed without delay
 */
export function filterStreamableSources(sources: MovieSource[]): MovieSource[] {
  return sources.filter(source => source.file);
}

/**
 * Filter sources that are not HEVC/H.265 (if allowHevc is false)
 *
 * @param sources - Array of movie sources to filter
 * @param allowHevc - Whether to allow HEVC/H.265 codecs (default: true)
 * @returns Filtered sources that are not HEVC/H.265 (if allowHevc is false)
 */
export function filterHevcSources(sources: MovieSource[], allowHevc = true): MovieSource[] {
  if (allowHevc) {
    return sources;
  }
  return sources.filter(
    source => source.videoCodec !== VideoCodec.X265 && source.videoCodec !== VideoCodec.X265_10BIT
  );
}

/**
 * Filter and sort movie sources for streaming
 *
 * @param sources - Array of movie sources to filter
 * @param allowHevc - Whether to allow HEVC/H.265 codecs (default: true)
 * @returns Filtered and sorted sources ready for streaming
 */
export function filterSources(sources: MovieSource[], allowHevc = true): MovieSource[] {
  return (
    filterHevcSources(filterStreamableSources(sources), allowHevc)
      // Sort by streaming score (highest first)
      .sort((a, b) => (b.streamingScore || 0) - (a.streamingScore || 0))
  );
}
