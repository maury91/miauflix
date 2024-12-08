import { ExtendedShowDto } from '@miauflix/types';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import {
  useGetShowSeasonQuery,
  useGetStreamUrlQuery,
  useStopStreamMutation,
} from '../../../../store/api/medias';
import { useAppDispatch, useAppSelector } from '../../../../store/store';
import {
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { MOVIE_PAGE } from '../consts';
import { IS_TIZEN } from '../../../../consts';
import { skipToken } from '@reduxjs/toolkit/query';
import { setStreamUrl } from '../../../../store/slices/stream';
import { navigateTo } from '../../../../store/slices/app';
import { SeasonSelector } from './seasonSelector';
import { Slider } from '../../../components/slider';
import { MediaButton } from './mediaButton';
import LineMdPlay from '~icons/line-md/play';

interface TvShowPageProps {
  media: ExtendedShowDto;
}

export const TvShowPage: FC<TvShowPageProps> = ({ media }) => {
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [selectedEpisode, setSelectedEpisode] = useState(0);
  const { data: season } = useGetShowSeasonQuery({
    showId: media.id,
    season: media.seasons[selectedSeason].number,
  });
  const episodesProgress = useAppSelector(
    (state) => state.resume.showProgress[media.id] ?? {}
  );
  const episodes = useMemo(() => {
    if (season) {
      return season.episodes.map((episode) => {
        const available = Date.now() > new Date(episode.firstAired).getTime();
        return {
          id: episode.id.toString(),
          backdrop: available ? episode.image : media.images.backdrop,
          progress: episodesProgress[`${season.number}-${episode.number}`] ?? 0,
          available,
          text: `S${season.number} E${episode.number}`,
        };
      });
    }
    return [];
  }, [episodesProgress, media.images.backdrop, season]);
  const episode = useMemo(() => {
    if (season && season.episodes[selectedEpisode]) {
      return {
        ...season.episodes[selectedEpisode],
        available:
          Date.now() >
          new Date(season.episodes[selectedEpisode].firstAired).getTime(),
      };
    }
    return null;
  }, [season, selectedEpisode]);
  const dispatch = useAppDispatch();
  const { ref } = useFocusable({
    focusKey: MOVIE_PAGE,
    isFocusBoundary: true,
    preferredChildFocusKey: 'season-selector',
  });
  const { data: streamInfo, isLoading } = useGetStreamUrlQuery(
    episode && episode.available
      ? {
          type: 'episode',
          id: episode.id.toString(),
          supportsHvec: IS_TIZEN, // Only Tizen supports HVEC, that may change in the future
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    }
  );
  const [stopStream] = useStopStreamMutation();
  // const hasStreamUrl = !!streamInfo;

  const handleSeasonChange = useCallback((season: number) => {
    setSelectedSeason(season);
  }, []);

  const handleEpisodeChange = useCallback((episode: number) => {
    setSelectedEpisode(episode);
  }, []);

  const goToStream = useCallback(() => {
    if (episode && season && streamInfo) {
      dispatch(
        setStreamUrl({
          url: streamInfo.stream,
          id: episode.traktId.toString(),
          season: season.number,
          episode: episode.number,
          type: 'episode',
        })
      );
      dispatch(navigateTo('player'));
    }
  }, [dispatch, episode, season, streamInfo]);

  useEffect(() => {
    return () => {
      if (streamInfo) {
        stopStream(streamInfo.streamId);
      }
    };
  }, [stopStream, streamInfo]);

  useEffect(() => {
    setFocus('season-selector');
    // focusSelf();
  }, []);

  // useEffect(() => {
  //   if (hasStreamUrl) {
  //     setFocus('watch-now');
  //   }
  // }, [hasStreamUrl]);

  // ToDo: Auto-select correct season
  // ToDo: Display details of the episode and auto-scroll

  return (
    <div ref={ref}>
      <SeasonSelector
        seasons={media.seasons}
        selected={selectedSeason}
        onSeasonChange={handleSeasonChange}
      />
      {season && (
        <Slider
          key={season.number.toString()}
          data={episodes}
          sliderKey={season.number.toString()}
          totalData={episodes.length}
          onHover={handleEpisodeChange}
          lastHovered={0}
          restrictUpAndDown={false}
        />
      )}
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
    </div>
  );
};
