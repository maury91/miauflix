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

/** The video codecs a client plays: HEVC by `allowHevc`, the rest by ffprobe name when known. */
export interface VideoCodecPreferences {
  allowHevc: boolean;
  /** ffprobe names ("h264", "av1"); unknown (every codec plays) when absent. */
  supportedVideoCodecs?: string[];
}

/** A release's video codec in ffprobe's names; HEVC is left to `allowHevc`. */
const PROBE_VIDEO_CODEC: Record<VideoCodec, string | null> = {
  [VideoCodec.X265]: null,
  [VideoCodec.X265_10BIT]: null,
  [VideoCodec.X264]: 'h264',
  [VideoCodec.X264_10BIT]: 'h264',
  [VideoCodec.AV1]: 'av1',
  [VideoCodec.AV1_10BIT]: 'av1',
  [VideoCodec.VP9]: 'vp9',
  [VideoCodec.VP8]: 'vp8',
  [VideoCodec.XVID]: 'mpeg4',
  [VideoCodec.MPEG4]: 'mpeg4',
  [VideoCodec.MPEG2]: 'mpeg2video',
  [VideoCodec.VC1]: 'vc1',
};

/**
 * Filter out sources whose video the client cannot play: HEVC as `filterHevcSources` does (it
 * can be converted, so `allowHevc` decides), any other codec the client reported it does not
 * decode (nothing converts it). A source whose codec is unknown stays.
 */
export function filterVideoCodecSources(
  sources: ContentSource[],
  { allowHevc, supportedVideoCodecs }: VideoCodecPreferences
): ContentSource[] {
  const compatible = filterHevcSources(sources, allowHevc);
  if (!supportedVideoCodecs) return compatible;
  return compatible.filter(source => {
    const codec = source.videoCodec ? PROBE_VIDEO_CODEC[source.videoCodec] : null;
    return codec === null || codec === undefined || supportedVideoCodecs.includes(codec);
  });
}

/**
 * Filter and sort movie sources for streaming
 *
 * @param sources - Array of movie sources to filter
 * @param codecs - The video codecs the client plays (default: every one)
 * @returns Filtered and sorted sources ready for streaming
 */
export function filterSources(
  sources: ContentSource[],
  codecs: VideoCodecPreferences = { allowHevc: true }
): ContentSource[] {
  return (
    filterVideoCodecSources(filterStreamableSources(sources), codecs)
      // Best first: streaming score, boosted by a recent proven playback
      .sort(byPlaybackRank())
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
