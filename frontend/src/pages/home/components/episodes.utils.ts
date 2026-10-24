import type { ProgressEntry } from '@miauflix/backend';

/** DOM id of an episode row, for focus and scrolling. */
export const episodeElementId = (
  showMediaId: number,
  seasonNumber: number,
  episodeNumber: number
) => `episode-${showMediaId}-${seasonNumber}:${episodeNumber}`;

/** "Watched", "Resume N%", or nothing for an episode without progress. */
export function episodeProgressLabel(
  entry: Pick<ProgressEntry, 'state' | 'positionSeconds' | 'durationSeconds'> | undefined
): string | null {
  if (!entry) return null;
  if (entry.state === 'completed') return 'Watched';
  const percent =
    entry.durationSeconds > 0
      ? Math.min(100, (entry.positionSeconds / entry.durationSeconds) * 100)
      : 0;
  return `Resume ${Math.round(percent)}%`;
}
