import type { MediaDto, ProgressEntry } from '@miauflix/backend';

/** The lookup key of a card: a movie, or a show for any of its episodes. */
export const progressKey = (media: MediaDto) =>
  `${media._type === 'movie' ? 'movie' : 'show'}:${media.mediaId}`;

const entryKey = (entry: ProgressEntry) =>
  entry.playable.kind === 'movie'
    ? `movie:${entry.playable.mediaId}`
    : entry.playable.kind === 'episode'
      ? `show:${entry.playable.showMediaId}`
      : null;

/** Unfinished entries first, then actual playback over next-episode suggestions, then recency. */
const preferred = (left: ProgressEntry, right: ProgressEntry) =>
  Number(left.state === 'completed') - Number(right.state === 'completed') ||
  Number(Boolean(left.nextEpisode)) - Number(Boolean(right.nextEpisode)) ||
  Date.parse(right.updatedAt) - Date.parse(left.updatedAt);

/**
 * The progress each card shows, by `progressKey`. Built once per progress change, so a card
 * receives its own entry instead of scanning every entry on each render.
 */
export function progressByMedia(
  progress: readonly ProgressEntry[] | undefined
): Map<string, ProgressEntry> {
  const result = new Map<string, ProgressEntry>();
  for (const entry of progress ?? []) {
    const key = entryKey(entry);
    if (!key) continue;
    const current = result.get(key);
    if (!current || preferred(entry, current) < 0) result.set(key, entry);
  }
  return result;
}
