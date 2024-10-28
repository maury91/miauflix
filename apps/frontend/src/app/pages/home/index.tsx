import { motion } from 'framer-motion';
import styled from 'styled-components';
import React, {
  FC,
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { MediaDetails } from './components/mediaDetails';
import {
  ExtendedMediaDto,
  MediaDto,
  VideoQuality,
  VideoQualityStr,
} from '@miauflix/types';
import { Categories } from './components/categories';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import LineMdLoadingTwotoneLoop from '~icons/line-md/loading-twotone-loop';
import LineMdPlay from '~icons/line-md/play';
import {
  FocusContext,
  setFocus,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';
import { PALETTE } from '../../../consts';
import { MEDIA_PAGE } from './consts';
import {
  useGetExtendedInfoQuery,
  useGetStreamUrlQuery,
} from '../../../store/api/medias';
import { skipToken } from '@reduxjs/toolkit/query';
import { useAppDispatch } from '../../../store/store';
import { setStreamUrl } from '../../../store/slices/stream';
import { navigateTo } from '../../../store/slices/app';

export const HomeContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;

const MediaPageContainer = styled.div<{ margin: number; visible: boolean }>`
  position: absolute;
  top: 50vh;
  left: ${({ margin }) => margin}px;
  right: ${({ margin }) => margin}px;
  bottom: 0;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;
`;

interface MediaPageProps {
  media: ExtendedMediaDto;
  visible: boolean;
}

const StyledMediaButton = styled.div<{
  disabled?: boolean;
  focused: boolean;
  loading?: boolean;
}>`
  position: relative;
  display: inline-flex;
  align-items: center;
  font-family: 'Poppins', sans-serif;
  padding: 1.5vh;
  font-size: 3vh;
  min-width: 10vw;
  color: ${({ disabled, focused }) =>
    disabled
      ? PALETTE.text.disabled
      : focused
      ? PALETTE.text.primary
      : PALETTE.text.secondary};
  background-color: ${({ disabled, focused }) =>
    disabled
      ? PALETTE.background.disabled
      : focused
      ? PALETTE.background.primary
      : PALETTE.background.secondary};
  font-weight: ${({ focused }) => (focused ? 600 : 500)};
  border-radius: 1vh;
  text-align: center;
  margin-right: 1vw;
  ${({ disabled }) => (disabled ? '' : 'cursor: pointer;')}
  text-transform: uppercase;
  svg {
    margin: 0 0.5vw;
  }
  svg:nth-of-type(1) {
    transform: ${({ loading }) => (loading ? 'scale(0.7)' : '')};
    transition: transform 0.3s;
  }
  svg:nth-of-type(2) {
    position: absolute;
  }
`;

type MediaButtonProps = PropsWithChildren<{
  disabled?: boolean;
  focusKey?: string;
  icon?: React.ReactElement;
  loading?: boolean;
  onClick?: () => void;
}>;

const MediaButton: FC<MediaButtonProps> = ({
  children,
  disabled,
  focusKey,
  icon,
  loading,
  onClick,
}) => {
  const handleOnClick = useCallback(() => {
    if (!disabled && onClick) {
      onClick();
    }
  }, [disabled, onClick]);
  const { focused, ref, focusSelf } = useFocusable({
    focusable: !disabled,
    focusKey,
    onEnterPress: handleOnClick,
  });

  return (
    <StyledMediaButton
      focused={focused}
      ref={ref}
      disabled={disabled}
      loading={loading}
      onMouseEnter={focusSelf}
      onClick={handleOnClick}
    >
      {icon}
      {loading && <LineMdLoadingTwotoneLoop />}
      {children}
    </StyledMediaButton>
  );
};

const MediaPage: FC<MediaPageProps> = ({ media, visible }) => {
  const { margin } = useMediaBoxSizes();
  const dispatch = useAppDispatch();
  const { focusKey, ref, focusSelf } = useFocusable({
    focusKey: MEDIA_PAGE,
    isFocusBoundary: true,
  });
  const { data: streamInfo, isLoading } = useGetStreamUrlQuery(
    media
      ? {
          type: 'movie',
          id: media.id,
          quality: getHighestValue(
            media.qualities.map(Number as (v: VideoQualityStr) => VideoQuality)
          ),
        }
      : skipToken
  );
  const hasStreamUrl = !!streamInfo;

  const goToStream = useCallback(() => {
    if (streamInfo) {
      dispatch(setStreamUrl(streamInfo.stream));
      dispatch(navigateTo('player'));
    }
  }, [dispatch, streamInfo]);

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

const getHighestValue = <T extends number>(arr: T[]): T =>
  Math.max(...arr) as T;

export const Home = () => {
  const [showCategories, setShowCategories] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaDto | null>(null);
  const { data: extendedMedia } = useGetExtendedInfoQuery(
    selectedMedia ? { type: 'movie', id: selectedMedia.id } : skipToken
  );

  const onMediaSelect = useCallback((media: MediaDto) => {
    setSelectedMedia(media);
    // Wait for previous animation to end before starting the next one
    setTimeout(() => {
      setShowCategories(false);
    }, 300);
  }, []);

  useEffect(() => {
    function handleBack(ev: KeyboardEvent) {
      console.log(ev);
      if (
        ev.code === 'Backspace' ||
        ev.code === 'Back' ||
        ev.code === 'Escape'
      ) {
        setShowCategories(true);
        setTimeout(() => {
          setSelectedMedia(null);
        }, 300);
      }
    }

    console.log('adding event listener');
    window.addEventListener('keydown', handleBack, { passive: false });
    return () => window.removeEventListener('keydown', handleBack);
  }, []);

  return (
    <>
      <MediaDetails expanded={!!selectedMedia} />
      <Categories visible={!selectedMedia} onMediaSelect={onMediaSelect} />
      {selectedMedia && extendedMedia && (
        <MediaPage media={extendedMedia} visible={!showCategories} />
      )}
    </>
  );
};
