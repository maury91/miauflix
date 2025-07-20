import { SeasonResponse } from '@miauflix/backend-client';
import { useMemo } from 'react';

export const useGetSelectedEpisode = (
  season: SeasonResponse | undefined,
  selectedEpisode: number
) => {
  return useMemo(() => {
    if (season && season.episodes[selectedEpisode]) {
      return {
        ...season.episodes[selectedEpisode],
        available: season.episodes[selectedEpisode].airDate
          ? Date.now() > new Date(season.episodes[selectedEpisode].airDate).getTime()
          : false,
      };
    }
    return null;
  }, [season, selectedEpisode]);
};
