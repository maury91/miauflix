import { FC, useCallback, useEffect, useState } from 'react';
import { useGetSeasonsQuery, useGetSeasonQuery } from '@store/api/shows';
import { useAppDispatch, useAppSelector } from '@store/store';
import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { SHOW_PAGE } from '../consts';
import { setStreamUrl } from '@store/slices/stream';
import { navigateTo } from '@store/slices/app';
import { useGetSelectedEpisode } from '../hooks/useGetSelectedEpisode';
import { useEpisodeStreaming } from '../hooks/useEpisodeStreaming';
import { usePreloadHomeImages } from '../hooks/usePreloadHomeImages';
import LineMdPlay from '~icons/line-md/play';
import { ShowResponse } from '@miauflix/backend-client';
import { MediaButton } from './mediaButton';
import { SeasonSelector } from './seasonSelector';
import { Slider } from '@components/slider';
import { useGetSeasonEpisodes } from '../hooks/useGetSeasonEpisodes';
import { skipToken } from '@reduxjs/toolkit/query';

interface TvShowPageProps {
  media: ShowResponse;
}

export const TvShowPage: FC<TvShowPageProps> = ({ media }) => {
  const page = useAppSelector(state => state.app.currentPage);
  const progress = useAppSelector(state => state.resume.showProgress[media.id]);

  // Calculate latest watched season and episode
  const [latestSeason, setLatestSeason] = useState<number>(() => {
    if (progress) {
      const episodesWithProgress = Object.keys(progress);
      return episodesWithProgress.reduce<number>((latestSeason, episode) => {
        const [seasonNumber] = episode.split('-').map(Number);
        return seasonNumber > latestSeason ? seasonNumber : latestSeason;
      }, 0);
    }
    return 0;
  });

  const [latestEpisode, setLatestEpisode] = useState<number>(() => {
    if (progress) {
      const episodesWithProgress = Object.keys(progress);
      return episodesWithProgress.reduce<number>((latestEpisode, episode) => {
        const [seasonNumber, episodeNumberRaw] = episode.split('-').map(Number);
        if (seasonNumber === latestSeason) {
          // ToDo: removing 1 feels hacky, look for better solution
          const episodeNumber = episodeNumberRaw - 1;
          return episodeNumber > latestEpisode ? episodeNumber : latestEpisode;
        }
        return latestEpisode;
      }, 0);
    }
    return 0;
  });

  // Calculate season index based on latest season
  const seasonIndex = media.seasons.findIndex(season => season.seasonNumber === latestSeason);
  const initialSeasonIndex =
    seasonIndex !== -1
      ? seasonIndex
      : media.seasons.findIndex(season => season.seasonNumber === 1) !== -1
        ? media.seasons.findIndex(season => season.seasonNumber === 1)
        : 0;

  const { data: seasons } = useGetSeasonsQuery({ id: String(media.id) });
  const [selectedSeason, setSelectedSeason] = useState(initialSeasonIndex);
  const [selectedEpisode, setSelectedEpisode] = useState(latestEpisode);

  const { data: season } = useGetSeasonQuery(
    page === 'home/details'
      ? {
          id: String(media.id),
          season: String(seasons ? seasons[selectedSeason]?.seasonNumber : 1),
        }
      : skipToken
  );

  const episode = useGetSelectedEpisode(season, selectedEpisode);
  const dispatch = useAppDispatch();
  const { ref } = useFocusable({
    focusKey: SHOW_PAGE,
    isFocusBoundary: true,
    preferredChildFocusKey: 'season-selector',
  });

  const { streamInfo, streamUrl, isLoading } = useEpisodeStreaming(
    episode && episode.available ? episode.id : null
  );

  const episodes = useGetSeasonEpisodes({
    defaultBackground: media.backdrop,
    loadingEpisode: isLoading ? selectedEpisode : false,
    media,
    season,
  });

  const preloadHomeImages = usePreloadHomeImages();

  const handleSeasonChange = useCallback((season: number) => {
    setSelectedSeason(season);
    setSelectedEpisode(0); // Reset episode when season changes
  }, []);

  const handleEpisodeChange = useCallback(
    (episode: number) => {
      if (episode !== selectedEpisode) {
        setSelectedEpisode(episode);
      }
    },
    [selectedEpisode]
  );

  const goToStream = useCallback(() => {
    if (episode && season && streamUrl && !isLoading) {
      dispatch(
        setStreamUrl({
          url: streamUrl,
          id: episode.id,
          showSlug: media.id.toString(),
          season: season.seasonNumber,
          episode: episode.episodeNumber,
          type: 'episode',
        })
      );
      dispatch(navigateTo('player'));
    }
  }, [dispatch, episode, isLoading, media.id, season, streamUrl]);

  useEffect(() => {
    setFocus('season-selector');
  }, []);

  useEffect(() => {
    if (season) {
      // Auto-focus logic can be added here if needed
    }
  }, [season]);

  // useEffect(() => {
  //   if (hasStreamUrl) {
  //     setFocus('watch-now');
  //   }
  // }, [hasStreamUrl]);

  // ToDo: Auto-select correct season
  // ToDo: Display details of the episode and auto-scroll

  // useWhatChanged(
  //   [
  //     episodes,
  //     season?.number,
  //     page === 'home/details',
  //     episodes.length,
  //     handleEpisodeChange,
  //     goToStream,
  //   ],
  //   "episodes, season?.number, page === 'home/details', episodes.length, handleEpisodeChange"
  // );

  return (
    <div ref={ref}>
      {season && episode && (
        <MediaButton
          disabled={!streamInfo || !episode.available}
          icon={<LineMdPlay />}
          loading={isLoading}
          focusKey="watch-now"
          onClick={goToStream}
        >
          Watch S{season.seasonNumber} E{episode.episodeNumber}
        </MediaButton>
      )}
      <SeasonSelector
        seasons={media.seasons}
        selected={page === 'home/details' ? selectedSeason : 0}
        onSeasonChange={handleSeasonChange}
      />
      {season && (
        <Slider
          data={episodes}
          key={season.seasonNumber}
          enabled={page === 'home/details'}
          lastHovered={latestEpisode}
          sliderKey={season.seasonNumber.toString()}
          totalData={episodes.length}
          onHover={handleEpisodeChange}
          onMediaSelect={goToStream}
          restrictUpAndDown={false}
        />
      )}
    </div>
  );
};
