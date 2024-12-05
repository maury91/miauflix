import styled from 'styled-components';
import pluralize from 'pluralize';
import { useMediaBoxSizes } from '../hooks/useMediaBoxSizes';
import { FC, useEffect, useState } from 'react';
import { useAppSelector } from '../../../../store/store';
import { scaleImage } from '../utils/scaleImage';
import {
  useGetExtendedMovieQuery,
  useGetExtendedShowQuery,
} from '../../../../store/api/medias';
import { IS_SLOW_DEVICE } from '../../../../consts';
import { motion, MotionConfig } from 'framer-motion';
import {
  MediaPreviewContainer,
  MediaPreviewShadow,
  MediaPreviewShadow2nd,
} from './media/mediaPreview';
import { MediaQuality } from './media/mediaQuality';
import { MovieDto, ShowDto } from '@miauflix/types';

const MediaImage = styled(motion.div)<{ src: string }>`
  background: url(${({ src }) => src}) center right no-repeat;
  background-size: cover;
  position: absolute;
  height: 65vh;
  left: 50vw;
  right: 0;
  top: 0;
`;

const MediaInformationContainer = styled.div<{ width: number }>`
  position: absolute;
  top: 10vh;
  width: ${({ width }) => width}px;
  svg {
    font-size: 4vh;
  }
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
  transition: -webkit-line-clamp 0.3s, line-clamp 0.3s;
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

const MovieInformation: FC<{ expanded: boolean; movie: MovieDto }> = ({
  expanded,
  movie,
}) => {
  const { data: extendedInfo } = useGetExtendedMovieQuery(movie.id);

  if (!extendedInfo) {
    return <MovieInformationSkeleton />;
  }

  return (
    <>
      <MediaTitle>{movie.title}</MediaTitle>
      <MediaSubTitle>
        <span>{extendedInfo.runtime} min</span>
        <span>{extendedInfo.year}</span>
        {'qualities' in extendedInfo && (
          <MediaQuality qualities={extendedInfo.qualities} />
        )}
      </MediaSubTitle>
      <MediaDescription expanded={expanded}>
        {extendedInfo.overview}
      </MediaDescription>
    </>
  );
};

const ShowInformation: FC<{ expanded: boolean; show: ShowDto }> = ({
  expanded,
  show,
}) => {
  const { data: extendedInfo } = useGetExtendedShowQuery(show.id);

  if (!extendedInfo) {
    return <MovieInformationSkeleton />;
  }

  return (
    <>
      <MediaTitle>{show.title}</MediaTitle>
      <MediaSubTitle>
        <span>
          {extendedInfo.seasonsCount}{' '}
          {pluralize('season', extendedInfo.seasonsCount)}
        </span>
        <span>{extendedInfo.year}</span>
      </MediaSubTitle>
      <MediaDescription expanded={expanded}>
        {extendedInfo.overview}
      </MediaDescription>
    </>
  );
};

export const MediaDetails: FC<{ expanded: boolean }> = ({ expanded }) => {
  const { margin } = useMediaBoxSizes();
  const [imageVisible, setImageVisible] = useState(false);
  const selectedMedia = useAppSelector((state) => state.home.selectedMedia);
  const imageSrc = selectedMedia
    ? scaleImage(selectedMedia.images.backdrops[0])
    : '';
  const [displayedSrc, setDisplayedSrc] = useState(imageSrc);

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
    return null;
  }
  return (
    <MediaPreviewContainer margin={margin / 2}>
      <MotionConfig transition={{ duration: imageVisible ? 1 : 0.3 }}>
        {displayedSrc && (
          <MediaImage
            src={displayedSrc}
            initial={{ opacity: 1 }}
            animate={{ opacity: imageVisible ? 1 : 0 }}
            exit={{ opacity: 0 }}
          />
        )}
      </MotionConfig>
      <MediaPreviewShadow />
      <MediaPreviewShadow2nd />
      <MediaInformationContainer width={window.innerWidth * 0.47 - margin / 2}>
        {selectedMedia.type === 'movie' && (
          <MovieInformation expanded={expanded} movie={selectedMedia} />
        )}
        {selectedMedia.type === 'show' && (
          <ShowInformation expanded={expanded} show={selectedMedia} />
        )}
      </MediaInformationContainer>
    </MediaPreviewContainer>
  );
};
