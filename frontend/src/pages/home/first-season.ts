import type { ProgressEntry, ShowResponse } from '@miauflix/backend';

/** Open the most recently watched regular season, or the first regular season. */
export function firstSeason(show: ShowResponse, progress: ProgressEntry[]): number | undefined {
  const seasons = show.seasons.filter(season => season.seasonNumber > 0);
  const resume = progress
    .filter(
      entry => entry.playable.kind === 'episode' && entry.playable.showMediaId === show.mediaId
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  if (
    resume?.playable.kind === 'episode' &&
    seasons.some(season => season.seasonNumber === resume.playable.seasonNumber)
  ) {
    return resume.playable.seasonNumber;
  }
  return seasons.reduce<number | undefined>(
    (first, season) =>
      first === undefined ? season.seasonNumber : Math.min(first, season.seasonNumber),
    undefined
  );
}
