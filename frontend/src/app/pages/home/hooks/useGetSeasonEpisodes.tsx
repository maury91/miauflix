import { useAppSelector } from '../../../../store/store';
import { useMemo } from 'react';
import { ExtendedShowDto, SeasonDto } from '@miauflix/types';

interface GetSeasonEpisodesArgs {
  defaultBackground: string;
  loadingEpisode: number | false;
  media: ExtendedShowDto;
  season: SeasonDto | undefined;
}

export const useGetSeasonEpisodes = ({ loadingEpisode, media, season }: GetSeasonEpisodesArgs) => {
  const episodesProgress = useAppSelector(state => state.resume.showProgress[media.id]);

  return useMemo(() => {
    if (season) {
      return season.episodes.map((episode, index) => {
        const available = Date.now() > new Date(episode.firstAired).getTime();
        return {
          id: episode.id,
          backdrop: available ? episode.image : media.images.backdrop,
          progress: episodesProgress?.[`${season.number}-${episode.number}`] ?? 0,
          available,
          text: `S${season.number} E${episode.number}`,
          playable: available,
          loading: index === loadingEpisode,
        };
      });
    }
    return [];
  }, [episodesProgress, loadingEpisode, media.images.backdrop, season]);
};
