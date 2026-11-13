import { resumeEpisodeProgress } from '@features/progress/lib/episode-rules';
import type { ProgressEntry, ShowResponse } from '@miauflix/backend';

/** Open the season of the episode details resume, or the first regular season. */
export function firstSeason(show: ShowResponse, progress: ProgressEntry[]): number | undefined {
  const seasons = show.seasons.filter(season => season.seasonNumber > 0);
  const resume = resumeEpisodeProgress(progress, show.mediaId);
  if (resume && seasons.some(season => season.seasonNumber === resume.playable.seasonNumber)) {
    return resume.playable.seasonNumber;
  }
  return seasons.reduce<number | undefined>(
    (first, season) =>
      first === undefined ? season.seasonNumber : Math.min(first, season.seasonNumber),
    undefined
  );
}
