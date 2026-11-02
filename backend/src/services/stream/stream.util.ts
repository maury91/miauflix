import { VideoCodec } from '@miauflix/source-metadata-extractor';

import type { ContentSource } from '@entities/content-source.entity';

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
      // Sort by streaming score (highest first)
      .sort((a, b) => (b.streamingScore || 0) - (a.streamingScore || 0))
  );
}

/** The bytes a source plays, or null when unknown: the whole source, or an episode's file. */
export type PlayedSize = (source: ContentSource) => number | null;
const wholeSource: PlayedSize = source => source.size || null;

/**
 * A source's average bitrate in kbit/s, from the bytes it plays and the runtime, or null when
 * either is unknown. Extras in the source count too, so this errs on the high side.
 */
export function estimatedBitrateKbps(
  source: ContentSource,
  runtimeSeconds: number,
  sizeOf: PlayedSize = wholeSource
): number | null {
  const size = sizeOf(source);
  if (!size || !(runtimeSeconds > 0)) return null;
  return (size * 8) / runtimeSeconds / 1000;
}

/** Whether a source fits the client's bitrate cap; a source of unknown bitrate fits. */
export function fitsBitrate(
  source: ContentSource,
  maxBitrateKbps: number,
  runtimeSeconds: number,
  sizeOf: PlayedSize = wholeSource
): boolean {
  const bitrate = estimatedBitrateKbps(source, runtimeSeconds, sizeOf);
  return bitrate === null || bitrate <= maxBitrateKbps;
}

/**
 * Order sources for a client that cannot sustain more than `maxBitrateKbps`: the ones that fit
 * keep their order, then the rest from the leanest, so a source over the cap is still a fallback.
 */
export function preferWithinBitrate(
  sources: ContentSource[],
  maxBitrateKbps: number,
  runtimeSeconds: number,
  sizeOf: PlayedSize = wholeSource
): ContentSource[] {
  const fits = (source: ContentSource) =>
    fitsBitrate(source, maxBitrateKbps, runtimeSeconds, sizeOf);
  const over = sources
    .filter(source => !fits(source))
    .sort((a, b) => (sizeOf(a) ?? 0) - (sizeOf(b) ?? 0));
  return [...sources.filter(fits), ...over];
}
