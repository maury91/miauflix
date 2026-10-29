import { VideoCodec } from '@miauflix/source-metadata-extractor';

import type { ContentSource } from '@entities/content-source.entity';
import { byPlaybackRank } from '@utils/streaming-score.util';

/**
 * Filter sources that can be streamed without delay: their file list is known and holds a
 * real video.
 *
 * @param sources - Array of movie sources to filter
 * @returns Filtered sources that can be streamed without delay
 */
export function filterStreamableSources(sources: ContentSource[]): ContentSource[] {
  return sources.filter(source => source.file && source.hasVideo !== false);
}

/**
 * Filter sources that are not HEVC/H.265 (if allowHevc is false)
 *
 * @param sources - Array of movie sources to filter
 * @param allowHevc - Whether to allow HEVC/H.265 codecs (default: true)
 * @returns Filtered sources that are not HEVC/H.265 (if allowHevc is false)
 */
export function filterHevcSources(sources: ContentSource[], allowHevc = true): ContentSource[] {
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
export function filterSources(sources: ContentSource[], allowHevc = true): ContentSource[] {
  return (
    filterHevcSources(filterStreamableSources(sources), allowHevc)
      // Best first: streaming score, boosted by a recent proven playback
      .sort(byPlaybackRank())
  );
}
