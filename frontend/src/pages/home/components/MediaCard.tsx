import type { MediaDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { forwardRef, type KeyboardEvent } from 'react';
import styled from 'styled-components';

import { getImageUrl, getMediaTitle } from '../media.utils';

const Card = styled.button<{ $backdrop: string; $width: number }>`
  flex: 0 0 ${({ $width }) => $width}px;
  width: ${({ $width }) => $width}px;
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0;
  border-radius: 6px;
  overflow: hidden;
  background: url(${props => props.$backdrop}) center / cover no-repeat;
  background-color: ${PALETTE.background.popup};
  color: ${PALETTE.text.primary};
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;

  &:hover,
  &:focus-visible {
    transform: scale(1.045);
    box-shadow: 0 0 0 3px ${PALETTE.color.interactive};
    outline: none;
    z-index: 2;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const TitleOverlay = styled.span`
  position: absolute;
  inset: auto 0 0;
  padding: 18px 10px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.88));
  font:
    600 0.85rem 'Poppins',
    sans-serif;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface MediaCardProps {
  media: MediaDto;
  width: number;
  tabIndex: number;
  onFocus: () => void;
  onHover: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(function MediaCard(
  { media, onFocus, onHover, onKeyDown, tabIndex, width },
  ref
) {
  const title = getMediaTitle(media);
  return (
    <Card
      ref={ref}
      type="button"
      $backdrop={getImageUrl(media.backdrop)}
      $width={width}
      aria-label={title}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onMouseEnter={onHover}
      onClick={onFocus}
      onKeyDown={onKeyDown}
    >
      <TitleOverlay>{title}</TitleOverlay>
    </Card>
  );
});
