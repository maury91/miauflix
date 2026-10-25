import type { ContentSource } from '@entities/content-source.entity';

/** How a target file was chosen inside its source. */
export type PlaybackMatchKind = 'combined' | 'movie' | 'single';

/**
 * One file inside a content source. Every read, warmup, and download names its file through
 * a target, so concurrent viewers of different files in one source never share state.
 */
export interface PlaybackTarget {
  source: ContentSource;
  filePath: string;
  matchKind: PlaybackMatchKind;
  /** Runtime of the file when known (probed); sizes the stream's readahead. */
  durationSeconds?: number;
}

/** The same source, addressing another file (for example a subtitle sidecar). */
export const withFile = (target: PlaybackTarget, filePath: string): PlaybackTarget => ({
  ...target,
  filePath,
});
