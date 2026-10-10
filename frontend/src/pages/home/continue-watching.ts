import type { ProgressEntry } from '@miauflix/backend';

/**
 * Return one unfinished entry per movie or show, newest first.
 * Exclude completed entries and playback at or before five seconds or within one second of
 * the end. Next-episode suggestions bypass position limits, but actual playback takes
 * priority over suggestions for the same title; otherwise the newest timestamp wins.
 */
export function unfinishedProgress(entries: ProgressEntry[]): ProgressEntry[] {
  const latest = new Map<string, ProgressEntry>();
  for (const entry of entries) {
    if (
      entry.state === 'completed' ||
      (!entry.nextEpisode && entry.positionSeconds <= 5) ||
      (!entry.nextEpisode && entry.positionSeconds >= entry.durationSeconds - 1)
    )
      continue;
    const key =
      entry.playable.kind === 'movie'
        ? `movie:${entry.playable.mediaId}`
        : `show:${entry.playable.showMediaId}`;
    const previous = latest.get(key);
    if (
      !previous ||
      (previous.nextEpisode && !entry.nextEpisode) ||
      (Boolean(previous.nextEpisode) === Boolean(entry.nextEpisode) &&
        Date.parse(previous.updatedAt) < Date.parse(entry.updatedAt))
    )
      latest.set(key, entry);
  }
  return [...latest.values()].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}
