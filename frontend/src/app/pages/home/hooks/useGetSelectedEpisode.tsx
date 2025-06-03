import { SeasonDto } from '@miauflix/types';
import { useMemo } from 'react';

export const useGetSelectedEpisode = (season: SeasonDto | undefined, selectedEpisode: number) => {
  return useMemo(() => {
    if (season && season.episodes[selectedEpisode]) {
      return {
        ...season.episodes[selectedEpisode],
        available: Date.now() > new Date(season.episodes[selectedEpisode].firstAired).getTime(),
      };
    }
    return null;
  }, [season, selectedEpisode]);
};
