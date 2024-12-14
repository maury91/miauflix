import { ExtendedShowDto } from '@miauflix/types';
import React, { FC, useCallback, useEffect, useState } from 'react';
import {
  useGetShowSeasonQuery,
  useGetShowSeasonsQuery,
  useStopStreamMutation,
} from '../../../../store/api/medias';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import {
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
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
import { useWhatChanged } from '@simbathesailor/use-what-changed';

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

export const TvShowPage: FC<TvShowPageProps> = ({ media }) => {
  const page = useAppSelector((state) => state.app.currentPage);
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [selectedEpisode, setSelectedEpisode] = useState(0);
  const { data: season } = useGetShowSeasonQuery({
    showId: media.id,
    season: media.seasons[selectedSeason].number,
  });
  const episode = useGetSelectedEpisode(season, selectedEpisode);
  const dispatch = useAppDispatch();
  const { ref } = useFocusable({
    focusKey: MOVIE_PAGE,
    isFocusBoundary: true,
    preferredChildFocusKey: 'season-selector',
  });
  const { streamInfo, isLoading } = useEpisodeStreaming(
    episode && episode.available && episode.id
  );
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
          stopStream(streamInfo.streamId);
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
          id: episode.traktId.toString(),
          season: season.number,
          episode: episode.number,
          type: 'episode',
          streamId: streamInfo.streamId,
        })
      );
      dispatch(navigateTo('player'));
    }
  }, [dispatch, episode, isLoading, season, streamInfo]);

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
        selected={selectedSeason}
        onSeasonChange={handleSeasonChange}
      />
      {season && (
        <Slider
          data={episodes}
          key={season.number}
          enabled={page === 'home/details'}
          lastHovered={0}
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
