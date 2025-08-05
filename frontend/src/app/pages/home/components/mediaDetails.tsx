import type { MovieResponse, ShowResponse } from '@miauflix/backend-client';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useAppSelector } from '@store/store';
import { motion, MotionConfig } from 'framer-motion';
import pluralize from 'pluralize';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { IS_SLOW_DEVICE } from '@/consts';

import { useControls } from '../../../hooks/useControls';
import { MEDIA_DETAILS_FOCUS_KEY } from '../consts';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { scaleImage } from '../utils/scaleImage';
import {
  MediaPreviewContainer,
  MediaPreviewShadow,
  MediaPreviewShadow2nd,
} from './media/mediaPreview';
import { MediaQuality } from './media/mediaQuality';
import { MoviePage } from './moviePage';
import { TvShowPage } from './tvShowPage';

const MediaImage = styled(motion.div)<{ src: string }>`
  position: absolute;
  height: 55vh;
  left: 50vw;
  right: 0;
  top: 0;
  overflow: hidden;

  div {
    background: url(${({ src }) => src}) center right no-repeat;
    background-size: cover;
    height: 65vh;
  }
`;

const MediaInformationContainer = styled.div<{ width: number }>`
  width: ${({ width }) => width}px;
  svg {
    font-size: 4vh;
  }
`;

const MediaContainer = styled.div<{ width: number }>`
  position: relative;
  top: 20vh;
  width: ${({ width }) => width}px;
`;

const MediaTitle = styled.h2`
  margin: 0;
  font-size: 5vh;
  font-weight: 600;
  text-transform: none;
`;

const MediaSubTitle = styled.h3`
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 3vh;
  text-transform: none;
  span {
    margin-right: 1vw;
  }
`;

const MediaDescription = styled.p<{ expanded: boolean }>`
  font-weight: 300;
  font-size: 2.5vh;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: ${({ expanded }) => (expanded ? 6 : 3)};
  line-clamp: ${({ expanded }) => (expanded ? 6 : 3)};
  -webkit-box-orient: vertical;
  transition:
    -webkit-line-clamp 0.3s,
    line-clamp 0.3s;
`;

const MediaPageContainer = styled.div<{ visible: boolean }>`
  margin-top: 10vh;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  transition: opacity 0.3s;
`;

const MovieInformationSkeleton: FC = () => {
  return (
    <>
      <MediaTitle />
      <MediaSubTitle>
        <span />
        <span />
        <MediaQuality qualities={[]} />
      </MediaSubTitle>
      <MediaDescription expanded={false} />
    </>
  );
};

const MovieInformation: FC<{
  expanded: boolean;
  movie: MovieResponse;
}> = ({ expanded, movie }) => {
  return (
    <>
      <MediaTitle>{movie.title}</MediaTitle>
      <MediaSubTitle>
        {'runtime' in movie && <span>{movie.runtime} min</span>}
        <span>{movie.releaseDate}</span> {/* FixMe: this should display the year */}
        <MediaQuality qualities={movie.sources?.map(s => s.quality)} />
      </MediaSubTitle>
      {'overview' in movie && (
        <MediaDescription expanded={expanded}>{movie.overview}</MediaDescription>
      )}
    </>
  );
};

const ShowInformation: FC<{
  expanded: boolean;
  show: ShowResponse;
}> = ({ expanded, show }) => {
  // Calculate seasonsCount from the seasons array
  const seasonsCount = show.seasons?.length || 0;

  return (
    <>
      <MediaTitle>{show.title}</MediaTitle>
      <MediaSubTitle>
        {seasonsCount > 0 && (
          <span>
            {seasonsCount} {pluralize('season', seasonsCount)}
          </span>
        )}
        <span>{show.firstAirDate}</span>
      </MediaSubTitle>
      {'overview' in show && (
        <MediaDescription expanded={expanded}>{show.overview}</MediaDescription>
      )}
    </>
  );
};

export const MediaDetails: FC<{
  expanded: boolean;
  expandedVisible: boolean;
  onNavigateBack: () => void;
}> = ({ expanded, expandedVisible, onNavigateBack }) => {
  const page = useAppSelector(state => state.app.currentPage);
  const { margin } = useMediaBoxSizes();
  const [imageVisible, setImageVisible] = useState(false);
  const selectedMedia = useAppSelector(state => state.home.selectedMedia);
  const imageSrc =
    selectedMedia && selectedMedia.backdrop ? scaleImage(selectedMedia.backdrop) : '';
  const [displayedSrc, setDisplayedSrc] = useState(imageSrc);
  const on = useControls();

  const { ref, focusKey } = useFocusable({
    focusable: expandedVisible,
    focusKey: MEDIA_DETAILS_FOCUS_KEY,
    saveLastFocusedChild: true,
    autoRestoreFocus: true,
  });

  useEffect(() => on(['back'], onNavigateBack), [on, onNavigateBack]);

  useEffect(() => {
    setImageVisible(false);
    const handler = setTimeout(
      () => {
        if (imageSrc) {
          const img = new Image();
          img.src = imageSrc;
          img.onload = () => {
            setImageVisible(true);
            setDisplayedSrc(imageSrc);
          };
        }
      },
      IS_SLOW_DEVICE ? 1000 : 100
    );

    return () => {
      clearTimeout(handler);
    };
  }, [imageSrc]);

  if (!selectedMedia) {
    // Show skeleton
    return null;
  }
  return (
    <FocusContext.Provider value={focusKey}>
      <MediaPreviewContainer
        margin={margin / 2}
        expanded={expanded}
        visible={page.startsWith('home')}
        ref={ref}
      >
        <MotionConfig transition={{ duration: imageVisible ? 1 : 0.3 }}>
          {displayedSrc && (
            <MediaImage
              src={displayedSrc}
              initial={{ opacity: 1 }}
              animate={{ opacity: imageVisible ? 1 : 0 }}
              exit={{ opacity: 0 }}
            >
              <div />
            </MediaImage>
          )}
        </MotionConfig>
        <MediaPreviewShadow />
        <MediaPreviewShadow2nd />
        <MediaContainer width={window.innerWidth - margin}>
          <MediaInformationContainer width={window.innerWidth * 0.47 - margin / 2}>
            {selectedMedia.type === 'movie' ? (
              <MovieInformation expanded={expanded} movie={selectedMedia} />
            ) : (
              <ShowInformation expanded={expanded} show={selectedMedia} />
            )}
          </MediaInformationContainer>
          <MediaPageContainer visible={expandedVisible}>
            {expanded &&
              (selectedMedia.type === 'movie' ? (
                <MoviePage media={selectedMedia} />
              ) : (
                <TvShowPage media={selectedMedia} />
              ))}
          </MediaPageContainer>
        </MediaContainer>
      </MediaPreviewContainer>
    </FocusContext.Provider>
  );
};
