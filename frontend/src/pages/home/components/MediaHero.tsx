import type { MediaDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

import { getImageUrl, getMediaTitle } from '../media.utils';

const Hero = styled.header<{ $backdrop: string }>`
  position: relative;
  min-height: 47vh;
  margin: -80px 0 0;
  padding: 14vh max(5vw, 40px) 8vh;
  display: flex;
  align-items: flex-end;
  background-image:
    linear-gradient(90deg, #000 5%, rgba(0, 0, 0, 0.78) 38%, rgba(0, 0, 0, 0.08) 72%),
    linear-gradient(0deg, #000 0%, transparent 42%), url(${({ $backdrop }) => $backdrop});
  background-position: center;
  background-size: cover;
`;
const Details = styled.div`
  width: min(620px, 55vw);
  position: relative;
  z-index: 1;
`;
const Logo = styled.img`
  max-width: min(360px, 40vw);
  max-height: 110px;
  object-fit: contain;
  object-position: left bottom;
  margin-bottom: 14px;
`;
const Title = styled.h1`
  margin: 0 0 10px;
  font-size: clamp(2rem, 4vw, 4rem);
  line-height: 1.05;
  font-weight: 600;
  text-transform: none;
`;
const Metadata = styled.p`
  margin: 0 0 12px;
  color: ${PALETTE.color.interactive};
  font-size: clamp(0.85rem, 1.35vw, 1.05rem);
`;
const Overview = styled.p`
  margin: 0;
  max-width: 60ch;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: clamp(0.9rem, 1.5vw, 1.12rem);
  line-height: 1.55;
`;

export const MediaHero: FC<{ media: MediaDto | null }> = ({ media }) => {
  if (!media) return <Hero $backdrop="" aria-hidden="true" />;
  const date = media._type === 'movie' ? media.releaseDate : media.firstAirDate;
  const runtime =
    media._type === 'movie'
      ? media.runtime && `${media.runtime} min`
      : media.episodeRunTime?.[0] && `${media.episodeRunTime[0]} min episodes`;
  const metadata = [date?.slice(0, 4), media.rating ? `★ ${media.rating.toFixed(1)}` : '', runtime]
    .filter(Boolean)
    .join(' · ');
  return (
    <Hero $backdrop={getImageUrl(media.backdrop, 'original')} aria-live="polite">
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
