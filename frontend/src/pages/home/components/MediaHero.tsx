import type { MediaDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

import { getImageUrl, getMediaTitle } from '../media.utils';

const Hero = styled.header<{ $backdrop: string }>`
  position: absolute;
  inset: 0 0 auto;
  z-index: 1;
  height: 55vh;
  padding: 10vh 5vw 9vh 7vw;
  display: flex;
  align-items: flex-end;
  background:
    radial-gradient(
      ellipse 72% 115% at 88% 0%,
      transparent 35%,
      rgba(0, 0, 0, 0.16) 51%,
      rgba(0, 0, 0, 0.78) 75%,
      #000 100%
    ),
    linear-gradient(
      90deg,
      #03050d 0%,
      rgba(3, 5, 13, 0.96) 28%,
      rgba(3, 5, 13, 0.35) 58%,
      transparent 78%
    ),
    linear-gradient(0deg, #000 0%, rgba(0, 0, 0, 0.62) 17%, transparent 48%),
    url(${({ $backdrop }) => $backdrop}) center right / cover no-repeat,
    #000;
  transition: background-image 300ms ease;

  &::after {
    content: '';
    position: absolute;
    top: 39.5vh;
    left: 65vw;
    right: 0;
    height: 15.5vh;
    pointer-events: none;
    background: linear-gradient(181deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 53%, #000 100%);
  }
`;

const Details = styled.div`
  width: min(44vw, 720px);
  position: relative;
  z-index: 1;
`;

const Logo = styled.img`
  max-width: min(28vw, 420px);
  max-height: 12vh;
  object-fit: contain;
  object-position: left bottom;
  margin-bottom: 1.5vh;
`;

const Title = styled.h1`
  margin: 0 0 1vh;
  font-size: clamp(2rem, 5vh, 4.6rem);
  line-height: 1.05;
  font-weight: 600;
  text-transform: none;
`;

const Metadata = styled.p`
  margin: 0 0 1vh;
  color: ${PALETTE.text.primary};
  font-size: clamp(0.85rem, 2.1vh, 1.2rem);
  font-weight: 500;
`;

const Overview = styled.p`
  max-width: 62ch;
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: clamp(0.9rem, 2.3vh, 1.3rem);
  line-height: 1.5;
`;

export const MediaHero: FC<{ media: MediaDto | null }> = ({ media }) => {
  if (!media) return <Hero $backdrop="" aria-hidden="true" />;
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  const metadata = [
    media._type === 'movie' && media.runtime ? `${media.runtime} min` : '',
    date?.slice(0, 4),
    media.rating ? `★ ${media.rating.toFixed(1)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Hero $backdrop={getImageUrl(media.backdrop, 'w1280')} aria-live="polite">
      <Details>
        {media.logo ? (
          <Logo src={getImageUrl(media.logo)} alt={getMediaTitle(media)} />
        ) : (
          <Title>{getMediaTitle(media)}</Title>
        )}
        <Metadata>{metadata}</Metadata>
        {media.genres.length > 0 && <Metadata>{media.genres.join(' · ')}</Metadata>}
        <Overview>{media.overview}</Overview>
      </Details>
    </Hero>
  );
};
