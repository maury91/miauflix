import React, { FC, useCallback, useEffect } from 'react';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { useAppDispatch } from '../../../../store/store';
import {
  FocusContext,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { MEDIA_PAGE } from '../consts';
import {
  useGetStreamUrlQuery,
  useStopStreamMutation,
} from '../../../../store/api/medias';
import { IS_TIZEN } from '../../../../consts';
import { skipToken } from '@reduxjs/toolkit/query';
import { setStreamUrl } from '../../../../store/slices/stream';
import { navigateTo } from '../../../../store/slices/app';
import LineMdPlay from '~icons/line-md/play';
import { ExtendedMediaDto } from '@miauflix/types';
import styled from 'styled-components';
import { MediaButton } from './mediaButton';

const MediaPageContainer = styled.div<{ margin: number; visible: boolean }>`
  position: absolute;
  top: 50vh;
  left: ${({ margin }) => margin + window.innerWidth * 0.05}px;
  right: ${({ margin }) => margin}px;
  bottom: 0;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;
`;

interface MediaPageProps {
  media: ExtendedMediaDto;
  visible: boolean;
}

export const MediaPage: FC<MediaPageProps> = ({ media, visible }) => {
  const { margin } = useMediaBoxSizes();
  const dispatch = useAppDispatch();
  const { focusKey, ref, focusSelf } = useFocusable({
    focusKey: MEDIA_PAGE,
    isFocusBoundary: true,
  });
  // FixMe: Update to use the correct media type once tv shows are created
  const { data: streamInfo, isLoading } = useGetStreamUrlQuery(
    media
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
        setStreamUrl({ url: streamInfo.stream, id: media.id, type: 'movie' })
      );
      dispatch(navigateTo('player'));
    }
  }, [dispatch, streamInfo]);

  useEffect(() => {
    return () => {
      if (streamInfo) {
        stopStream(streamInfo.streamId);
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
      <MediaPageContainer margin={margin / 2} visible={visible} ref={ref}>
        <MediaButton
          disabled={!streamInfo}
          icon={<LineMdPlay />}
          loading={isLoading}
          focusKey="watch-now"
          onClick={goToStream}
        >
          Watch now
        </MediaButton>
      </MediaPageContainer>
    </FocusContext.Provider>
  );
};
