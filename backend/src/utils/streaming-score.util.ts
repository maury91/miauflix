import { Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { ContentSource, SourceQuality } from '@entities/content-source.entity';

export type StreamingScoreInput = Pick<
  ContentSource,
  'broadcasters' | 'quality' | 'sourceUploadedAt' | 'videoCodec' | 'watchers'
>;

/** Quality points, capped at 3000: 2K and above score the same, so seeds decide between them. */
const QUALITY_SCORES: Record<SourceQuality, number> = {
  [Quality.SD]: 500,
  [Quality.HD]: 1500,
  [Quality.FHD]: 2500,
  [Quality['2K']]: 3000,
  [Quality['4K']]: 3000,
  [Quality['8K']]: 3000,
  '3D': 0,
};

/** Codec efficiency points, capped at 2000. */
const CODEC_SCORES: Record<VideoCodec, number> = {
  [VideoCodec.VC1]: 200,
  [VideoCodec.MPEG2]: 400,
  [VideoCodec.MPEG4]: 800,
  [VideoCodec.XVID]: 600,
  [VideoCodec.VP8]: 1200,
  [VideoCodec.VP9]: 1500,
  [VideoCodec.X264]: 1800,
  [VideoCodec.X264_10BIT]: 2000,
  [VideoCodec.X265]: 2000,
  [VideoCodec.X265_10BIT]: 2000,
  [VideoCodec.AV1]: 2000,
  [VideoCodec.AV1_10BIT]: 2000,
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * How well a source can be streamed, 0-10,000: availability (4000) + quality (3000) +
 * codec (2000) + activity (1000), scaled down for older uploads. Sources are ranked by it
 * wherever several copies of the same media compete.
 */
export function calculateStreamingScore(source: StreamingScoreInput, now = Date.now()): number {
  const broadcasters = source.broadcasters ?? 0;
  const watchers = source.watchers ?? 0;

  let availabilityScore = 0;
  if (broadcasters > 0) {
    availabilityScore = watchers
      ? Math.min(4000, (broadcasters * 30 + (broadcasters / watchers) * 100) * 1.33)
      : Math.min(4000, broadcasters * 40);
  }
  const qualityScore = source.quality ? QUALITY_SCORES[source.quality] : 1000;
  const codecScore = source.videoCodec ? CODEC_SCORES[source.videoCodec] : 1000;
  const activityScore = Math.min(1000, (broadcasters + watchers) * 10);

  let agePenalty = 0.9; // Unknown upload date
  if (source.sourceUploadedAt) {
    const yearsOld = (now - new Date(source.sourceUploadedAt).getTime()) / YEAR_MS;
    agePenalty = yearsOld < 1 ? 1 : yearsOld < 2 ? 0.85 : 0.7;
  }

  return Math.round((availabilityScore + qualityScore + codecScore + activityScore) * agePenalty);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ranking points for a source that played well today: below the smallest quality step (500). */
const PROVEN_PLAY_BOOST = 400;
/** The boost halves every this many days; swarms that once played well die out. */
const PROVEN_PLAY_HALF_LIFE_DAYS = 30;

/**
 * Ranking points for a source the backend saw play well on `lastPlayedOn` (`YYYY-MM-DD`),
 * fading with a 30-day half-life. A verified playback beats a tracker's seeder claim between
 * otherwise close candidates, but never lifts a source a whole quality step.
 */
export function provenPlayBoost(lastPlayedOn: string | null | undefined, now = Date.now()): number {
  if (!lastPlayedOn) return 0;
  const playedAt = Date.parse(`${lastPlayedOn}T00:00:00Z`);
  if (Number.isNaN(playedAt)) return 0;
  const ageDays = Math.max(0, (now - playedAt) / DAY_MS);
  return Math.round(PROVEN_PLAY_BOOST * 0.5 ** (ageDays / PROVEN_PLAY_HALF_LIFE_DAYS));
}

/** The score sources are ranked by for playback: the streaming score plus a proven-play boost. */
export function playbackRank(
  source: Pick<ContentSource, 'lastPlayedOn' | 'streamingScore'>,
  now = Date.now()
): number {
  return (source.streamingScore || 0) + provenPlayBoost(source.lastPlayedOn, now);
}

/** Order sources best first by `playbackRank`. */
export function byPlaybackRank(
  now = Date.now()
): (
  left: Pick<ContentSource, 'lastPlayedOn' | 'streamingScore'>,
  right: Pick<ContentSource, 'lastPlayedOn' | 'streamingScore'>
) => number {
  return (left, right) => playbackRank(right, now) - playbackRank(left, now);
}
