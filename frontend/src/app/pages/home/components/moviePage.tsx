import type { MovieResponse } from '@miauflix/backend-client';
import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useGetStreamingKeyMutation } from '@store/api/movies';
import { navigateTo } from '@store/slices/app';
import { useAppDispatch } from '@store/store';
import type { FC } from 'react';
import { useCallback, useEffect } from 'react';

import LineMdPlay from '~icons/line-md/play';

import { MOVIE_PAGE } from '../consts';
import { MediaButton } from './mediaButton';

interface MoviePageProps {
  media: MovieResponse;
}

export const MoviePage: FC<MoviePageProps> = ({ media }) => {
  const dispatch = useAppDispatch();
  const { focusKey, ref, focusSelf } = useFocusable({
    focusKey: MOVIE_PAGE,
    isFocusBoundary: true,
  });
  const [getStreamingKey, { data: streamDetails, isLoading }] = useGetStreamingKeyMutation();

  const goToStream = useCallback(() => {
    getStreamingKey({ id: String(media.id), quality: 'auto' });
  }, [getStreamingKey, media.id]);

  useEffect(() => {
    if (streamDetails) {
      // TODO: Fix setStreamUrl to accept the correct parameters
      // For now, we'll just navigate to player
      dispatch(navigateTo('player'));
    }
  }, [dispatch, media.id, streamDetails]);

  useEffect(() => {
    focusSelf();
  }, [focusSelf]);

  useEffect(() => {
    if (streamDetails) {
      setFocus('watch-now');
    }
  }, [streamDetails]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref}>
        <MediaButton
          disabled={!streamDetails}
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
