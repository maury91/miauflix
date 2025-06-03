import React, { FC, useCallback, useEffect } from 'react';
import { useAppDispatch } from '../../../../store/store';
import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { MOVIE_PAGE } from '../consts';
import { useGetStreamUrlQuery, useStopStreamMutation } from '../../../../store/api/medias';
import { DISABLE_STREAMING, IS_TIZEN } from '../../../../consts';
import { skipToken } from '@reduxjs/toolkit/query';
import { setStreamUrl } from '../../../../store/slices/stream';
import { navigateTo } from '../../../../store/slices/app';
import LineMdPlay from '~icons/line-md/play';
import { ExtendedMovieDto } from '@miauflix/types';
import { MediaButton } from './mediaButton';

interface MoviePageProps {
  media: ExtendedMovieDto;
}

export const MoviePage: FC<MoviePageProps> = ({ media }) => {
  const dispatch = useAppDispatch();
  const { focusKey, ref, focusSelf } = useFocusable({
    focusKey: MOVIE_PAGE,
    isFocusBoundary: true,
  });
  const { data: streamInfo, isLoading } = useGetStreamUrlQuery(
    media && !DISABLE_STREAMING
      ? {
          type: 'movie',
          id: media.id,
          supportsHvec: IS_TIZEN, // Only Tizen supports HVEC, that may change in the future
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    }
  );
  const [stopStream] = useStopStreamMutation();
  const hasStreamUrl = !!streamInfo;

  const goToStream = useCallback(() => {
    if (streamInfo) {
      dispatch(
        setStreamUrl({
          url: streamInfo.stream,
          id: media.id,
          type: 'movie',
          streamId: streamInfo.streamId,
        })
      );
      dispatch(navigateTo('player'));
    }
  }, [dispatch, media.id, streamInfo]);

  useEffect(() => {
    return () => {
      if (streamInfo) {
        console.log('Stop stream ( movie page )');
        // stopStream(streamInfo.streamId);
      }
    };
  }, [stopStream, streamInfo]);

  useEffect(() => {
    focusSelf();
  }, [focusSelf]);

  useEffect(() => {
    if (hasStreamUrl) {
      setFocus('watch-now');
    }
  }, [hasStreamUrl]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>
        <MediaButton
          disabled={!streamInfo}
          icon={<LineMdPlay />}
          loading={isLoading}
          focusKey="watch-now"
          onClick={goToStream}
        >
          Watch now
        </MediaButton>
      </div>
    </FocusContext.Provider>
  );
};
