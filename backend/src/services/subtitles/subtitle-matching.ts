/** Normalize release names without treating their punctuation or container as identity. */
function releaseTokens(name: string): Set<string> {
  return new Set(
    name
      .split(/[\\/]/)
      .pop()!
      .toLowerCase()
      .replace(/\.(?:mkv|mp4|avi|mov|wmv|flv|webm|m4v|srt|vtt|ass|ssa|sub)$/i, '')
      .replace(/web[ ._-]?dl/g, 'webdl')
      .replace(/blu[ ._-]?ray/g, 'bluray')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
}

function weight(token: string): number {
  // Release format matters more than the shared movie title when predicting sync.
  return /^(?:\d{3,4}p|webdl|webrip|bluray|brrip|bdrip|dvdrip|hdtv|screener|dcp|h264|h265|x264|x265|hevc|avc)$/.test(
    token
  )
    ? 3
    : 1;
}

/** Weighted Dice similarity, 0–100; null means the selected filename is unavailable.
 * This ranks filename evidence, not the probability that subtitle timing is correct.
 */
export function filenameSimilarity(
  videoFilename: string | undefined,
  names: string[]
): number | null {
  if (!videoFilename) return null;
  const video = releaseTokens(videoFilename);
  if (!video.size) return null;
  const videoWeight = [...video].reduce((sum, token) => sum + weight(token), 0);
  return Math.max(
    0,
    ...names.map(name => {
      const candidate = releaseTokens(name);
      const candidateWeight = [...candidate].reduce((sum, token) => sum + weight(token), 0);
      const sharedWeight = [...candidate].reduce(
        (sum, token) => sum + (video.has(token) ? weight(token) : 0),
        0
      );
      return Math.round((200 * sharedWeight) / (videoWeight + candidateWeight));
    })
  );
}
