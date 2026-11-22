import type { ProgressEntry } from '@miauflix/backend';
import { t } from '@shared/i18n';

type EpisodeProgress = Pick<ProgressEntry, 'state' | 'positionSeconds' | 'durationSeconds'>;

/** An episode row's ID in the navigation layer. */
export const episodeNavId = (seasonNumber: number, episodeNumber: number) =>
  `episode:${seasonNumber}:${episodeNumber}`;

/** The season and episode an `episodeNavId` names, or null for any other ID. */
export function parseEpisodeNavId(
  id: string | null
): { seasonNumber: number; episodeNumber: number } | null {
  const match = id?.match(/^episode:(\d+):(\d+)$/);
  return match ? { seasonNumber: Number(match[1]), episodeNumber: Number(match[2]) } : null;
}

/** A season button's ID in the navigation layer. */
export const seasonNavId = (seasonNumber: number) => `season:${seasonNumber}`;

/** Watched share from 0 to 1, or undefined for an episode without progress. */
export function episodeProgress(entry: EpisodeProgress | undefined): number | undefined {
  if (!entry) return undefined;
  if (entry.state === 'completed') return 1;
  return entry.durationSeconds > 0
    ? Math.min(1, Math.max(0, entry.positionSeconds / entry.durationSeconds))
    : 0;
}

/** "Watched", "Resume N%", or nothing for an episode without progress. */
export function episodeProgressLabel(entry: EpisodeProgress | undefined): string | null {
  const share = episodeProgress(entry);
  if (share === undefined) return null;
  if (entry?.state === 'completed') return t('details.watched');
  return t('details.resumePercent', { percent: Math.round(share * 100) });
}
