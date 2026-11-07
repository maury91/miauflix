/**
 * Media file helpers for judging a source's file list. Torrent and bitfield helpers live in the
 * media-load service.
 */

const VIDEO_EXTENSION = /\.(?:mp4|mkv|avi|mov|wmv|flv|webm|m4v)$/i;

/** Video container by extension, ignoring case (releases ship `Movie.MKV` too). */
export const isVideoFile = (filename: string) => VIDEO_EXTENSION.test(filename);

/** The largest video in a file list (first wins on ties), or null when there is none. */
export const mainVideoPath = (files: ReadonlyArray<{ path: string; length: number }>) => {
  let best: { path: string; length: number } | null = null;
  for (const file of files) {
    if (isVideoFile(file.path) && (!best || file.length > best.length)) best = file;
  }
  return best?.path ?? null;
};

/** Share of a source's bytes that must be video for it to count as real. */
const MIN_VIDEO_SHARE = 0.5;

/**
 * Whether a file list is a real release: video makes up most of the payload. Fakes ship an
 * executable or archive, sometimes beside a small video sample; episode packs still pass
 * because every episode counts toward the video share.
 */
export const containsPlayableVideo = (files: ReadonlyArray<{ path: string; length: number }>) => {
  let total = 0;
  let video = 0;
  for (const file of files) {
    total += file.length;
    if (isVideoFile(file.path)) video += file.length;
  }
  return video > 0 && video >= total * MIN_VIDEO_SHARE;
};
