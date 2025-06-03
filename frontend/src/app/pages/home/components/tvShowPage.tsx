import { ExtendedShowDto } from '@miauflix/types';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import {
  useGetShowSeasonQuery,
  useGetShowSeasonsQuery,
  useStopStreamMutation,
} from '../../../../store/api/medias';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { MOVIE_PAGE } from '../consts';
import { setStreamUrl } from '../../../../store/slices/stream';
import { navigateTo } from '../../../../store/slices/app';
import { SeasonSelector } from './seasonSelector';
import { setFocusOnSlider, Slider } from '../../../components/slider';
import { MediaButton } from './mediaButton';
import LineMdPlay from '~icons/line-md/play';
import { useEpisodeStreaming } from '../hooks/useEpisodeStreaming';
import { useGetSelectedEpisode } from '../hooks/useGetSelectedEpisode';
import { useGetSeasonEpisodes } from '../hooks/useGetSeasonEpisodes';
import { skipToken } from '@reduxjs/toolkit/query';

interface TvShowPageProps {
  media: ExtendedShowDto;
}

const usePreloadShowImages = (showId: string) => {
  const show = useGetShowSeasonsQuery(showId);
  useEffect(() => {
    if (show.data) {
      for (const season of show.data) {
        for (const episode of season.episodes) {
          if (episode.image) {
            const img = new Image();
            img.src = episode.image;
          }
        }
      }
    }
  }, [show]);
};

export const useLatestWatchedSeasonAndEpisode = (
  showId: string,
  seasons: ExtendedShowDto['seasons']
) => {
  const progress = useAppSelector(state => state.resume.showProgress[showId]);
  const [latestSeason, latestEpisode] = useMemo((): [number, number] => {
    if (progress) {
      const episodesWithProgress = Object.keys(progress);
      return episodesWithProgress.reduce<[number, number]>(
        ([latestSeason, latestEpisode], episode) => {
          const [seasonNumber, episodeNumberRaw] = episode.split('-').map(Number);
          // ToDo: removing 1 feels hacky, look for better solution
          const episodeNumber = episodeNumberRaw - 1;
          if (seasonNumber > latestSeason) {
            return [seasonNumber, episodeNumber];
          } else if (seasonNumber === latestSeason && episodeNumber > latestEpisode) {
            return [seasonNumber, episodeNumber];
          }
          return [latestSeason, latestEpisode];
        },
        [0, 0]
      );
    }
    return [0, 0];
  }, [progress]);
  return useMemo(() => {
    const seasonIndex = seasons.findIndex(season => season.number === latestSeason);
    if (seasonIndex !== -1) {
      return [seasonIndex, latestEpisode];
    }
    const seasonIndexFirstSeason = seasons.findIndex(season => season.number === 1);
    if (seasonIndexFirstSeason !== -1) {
      return [seasonIndexFirstSeason, 0];
    }
    return [0, 0];
  }, [latestEpisode, latestSeason, seasons]);
};

export const TvShowPage: FC<TvShowPageProps> = ({ media }) => {
  const page = useAppSelector(state => state.app.currentPage);
  const [latestSeason, latestEpisode] = useLatestWatchedSeasonAndEpisode(media.id, media.seasons);
  const [selectedSeason, setSelectedSeason] = useState(latestSeason);
  const [selectedEpisode, setSelectedEpisode] = useState(latestEpisode);
  const { data: season } = useGetShowSeasonQuery(
    page === 'home/details'
      ? {
          showId: media.id,
          season: media.seasons[selectedSeason].number,
        }
      : skipToken
  );
  const episode = useGetSelectedEpisode(season, selectedEpisode);
  const dispatch = useAppDispatch();
  const { ref } = useFocusable({
    focusKey: MOVIE_PAGE,
    isFocusBoundary: true,
    preferredChildFocusKey: 'season-selector',
  });
  const { streamInfo, isLoading } = useEpisodeStreaming(episode && episode.available && episode.id);
  const episodes = useGetSeasonEpisodes({
    defaultBackground: media.images.backdrop,
    loadingEpisode: isLoading ? selectedEpisode : false,
    media,
    season,
  });
  usePreloadShowImages(media.id);
  const [stopStream] = useStopStreamMutation();

  // const hasStreamUrl = !!streamInfo;

  const handleSeasonChange = useCallback((season: number) => {
    setSelectedSeason(season);
  }, []);

  const handleEpisodeChange = useCallback(
    (episode: number) => {
      if (episode !== selectedEpisode) {
        if (streamInfo) {
          console.log('Stopping stream (tv show page)');
          // stopStream(streamInfo.streamId);
        }
        setSelectedEpisode(episode);
      }
    },
    [selectedEpisode, stopStream, streamInfo]
  );

  const goToStream = useCallback(() => {
    if (episode && season && streamInfo && !isLoading) {
      dispatch(
        setStreamUrl({
          url: streamInfo.stream,
          id: episode.id,
          showSlug: media.id,
          season: season.number,
          episode: episode.number,
          type: 'episode',
          streamId: streamInfo.streamId,
        })
      );
      dispatch(navigateTo('player'));
    }
  }, [dispatch, episode, isLoading, media.id, season, streamInfo]);

  useEffect(() => {
    setFocus('season-selector');
    // focusSelf();
  }, []);

  useEffect(() => {
    if (season) {
      setFocusOnSlider(season.number);
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
          Watch S{season.number} E{episode.number}
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
          key={season.number}
          enabled={page === 'home/details'}
          lastHovered={latestEpisode}
          sliderKey={season.number}
          totalData={episodes.length}
          onHover={handleEpisodeChange}
          onMediaSelect={goToStream}
          restrictUpAndDown={false}
        />
      )}
    </div>
  );
};
