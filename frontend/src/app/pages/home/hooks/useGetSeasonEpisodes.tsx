import { useAppSelector } from '@store/store';
import { useMemo } from 'react';
import { ShowResponse, SeasonResponse } from '@miauflix/backend-client';

interface GetSeasonEpisodesArgs {
  defaultBackground: string | null;
  loadingEpisode: number | false;
  media: ShowResponse;
  season: SeasonResponse | undefined;
}

export const useGetSeasonEpisodes = ({ loadingEpisode, media, season }: GetSeasonEpisodesArgs) => {
  const episodesProgress = useAppSelector(state => state.resume.showProgress[media.id]);

  return useMemo(() => {
    if (season) {
      return season.episodes.map((episode, index) => {
        const available = episode.airDate
          ? Date.now() > new Date(episode.airDate).getTime()
          : false;
        return {
          id: episode.id,
          backdrop: (available ? episode.still : media.backdrop) || '',
          progress: episodesProgress?.[`${season.seasonNumber}-${episode.episodeNumber}`] ?? 0,
          available,
          text: `S${season.seasonNumber} E${episode.episodeNumber}`,
          playable: available,
          loading: index === loadingEpisode,
        };
      });
    }
    return [];
  }, [episodesProgress, loadingEpisode, media.backdrop, season]);
};
