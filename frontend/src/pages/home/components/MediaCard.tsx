import type { MediaDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

const Card = styled.div<{ $backdrop: string }>`
  flex-shrink: 0;
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: url(${props => props.$backdrop}) center / cover no-repeat;
  background-color: ${PALETTE.background.popup};
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 0 0 2px ${PALETTE.background.primary};
  }
`;

const TitleOverlay = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 10px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  color: ${PALETTE.text.primary};
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

function getTitle(media: MediaDto): string {
  if (media._type === 'movie') {
    return media.title;
  }
  return media.name;
}

function getBackdropUrl(path: string): string {
  if (!path) return '';
  // TMDB images: use w500 for card-sized backdrops
  if (path.startsWith('/')) {
    return `https://image.tmdb.org/t/p/w500${path}`;
  }
  return path;
}

interface MediaCardProps {
  media: MediaDto;
  width: number;
}

export const MediaCard: FC<MediaCardProps> = ({ media, width }) => {
  const title = getTitle(media);
  const backdrop = getBackdropUrl(media.backdrop);

  return (
    <Card $backdrop={backdrop} style={{ width }} title={title}>
      <TitleOverlay>{title}</TitleOverlay>
    </Card>
  );
};
