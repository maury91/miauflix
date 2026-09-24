import type { MediaDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { forwardRef } from 'react';
import styled from 'styled-components';

import { getImageUrl, getMediaTitle } from '../media.utils';

const Card = styled.button<{
  $backdrop: string;
  $logo?: string;
  $width: number;
  $selected: boolean;
}>`
  flex: 0 0 ${({ $width }) => $width}px;
  width: ${({ $width }) => $width}px;
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0.6vh solid ${({ $selected }) => ($selected ? PALETTE.color.interactive : 'transparent')};
  border-radius: 0.7vh;
  overflow: hidden;
  background: ${({ $backdrop, $logo }) =>
    $logo
      ? `url(${$logo}) 10% 10% / 60% auto no-repeat, url(${$backdrop}) center / cover no-repeat`
      : `url(${$backdrop}) center / cover no-repeat`};
  background-color: ${PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  cursor: pointer;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 0.35vh ${PALETTE.color.interactive};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const TitleOverlay = styled.span<{ $hasLogo: boolean }>`
  position: absolute;
  inset: auto 0 0;
  padding: 2.2vh 1vh 0.8vh;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.88));
  font:
    600 1.8vh 'Poppins',
    sans-serif;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: ${({ $hasLogo }) => ($hasLogo ? 0 : 1)};
`;

interface MediaCardProps {
  media: MediaDto;
  width: number;
  selected: boolean;
  tabIndex: number;
  onFocus: () => void;
  onHover: () => void;
  onSelect: () => void;
}

export const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(function MediaCard(
  { media, onFocus, onHover, onSelect, selected, tabIndex, width },
  ref
) {
  const title = getMediaTitle(media);
  return (
    <Card
      ref={ref}
      type="button"
      $backdrop={getImageUrl(media.backdrop)}
      $logo={media.logo ? getImageUrl(media.logo) : undefined}
      $selected={selected}
      $width={width}
      aria-label={title}
      aria-current={selected ? 'true' : undefined}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onMouseEnter={onHover}
      onClick={onSelect}
    >
      <TitleOverlay $hasLogo={Boolean(media.logo)}>{title}</TitleOverlay>
    </Card>
  );
});
