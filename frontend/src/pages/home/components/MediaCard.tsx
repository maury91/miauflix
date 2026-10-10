import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { forwardRef } from 'react';
import styled from 'styled-components';

import { getImageUrl, getMediaTitle } from '../media.utils';

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
const Card = styled(BaseButton)<{
  $backdrop: string;
  $logo?: string;
  $width: number;
  $selected: boolean;
}>`
  flex: 0 0 ${({ $width }) => $width}px;
  width: ${({ $width }) => $width}px;
  min-width: 0;
  min-height: 0;
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
  box-shadow: none;

  &:focus-visible {
    outline: none;
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

const ProgressTrack = styled.span`
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 0.55vh;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.72);
`;

const ProgressFill = styled.span<{ $percent: number }>`
  display: block;
  width: ${({ $percent }) => `${$percent}%`};
  height: 100%;
  background: #e50914;
`;

interface MediaCardProps {
  media: MediaDto;
  width: number;
  selected: boolean;
  tabIndex: number;
  onFocus: () => void;
  onHover: () => void;
  onSelect: () => void;
  progress?: ProgressEntry[];
}

/**
 * Select progress for a movie or any episode of a show, or undefined when none matches.
 * Prefer unfinished entries, then actual playback over next-episode suggestions, then recency.
 */
function progressForMedia(progress: ProgressEntry[] | undefined, media: MediaDto) {
  if (!progress?.length) return undefined;
  const matching = progress.filter(entry => {
    if (media._type === 'movie') {
      return entry.playable.kind === 'movie' && entry.playable.mediaId === media.mediaId;
    }
    return entry.playable.kind === 'episode' && entry.playable.showMediaId === media.mediaId;
  });
  return matching.sort((left, right) => {
    const completionOrder =
      Number(left.state === 'completed') - Number(right.state === 'completed');
    return (
      completionOrder ||
      Number(Boolean(left.nextEpisode)) - Number(Boolean(right.nextEpisode)) ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  })[0];
}

/** Render a focusable media card with playback progress and the selected episode’s label when available. */
export const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(function MediaCard(
  { media, onFocus, onHover, onSelect, progress, selected, tabIndex, width },
  ref
) {
  const title = getMediaTitle(media);
  const playback = progressForMedia(progress, media);
  const percent = playback
    ? playback.state === 'completed'
      ? 100
      : Math.max(0, Math.min(100, (playback.positionSeconds / playback.durationSeconds) * 100))
    : 0;
  const cardTitle =
    media._type === 'tvshow' && playback?.playable.kind === 'episode'
      ? `${title} · S${playback.playable.seasonNumber} E${playback.playable.episodeNumber}`
      : title;
  return (
    <Card
      ref={ref}
      type="button"
      $backdrop={getImageUrl(media.backdrop)}
      $logo={media.logo ? getImageUrl(media.logo) : undefined}
      $selected={selected}
      $width={width}
      aria-label={cardTitle}
      aria-current={selected ? 'true' : undefined}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onMouseEnter={onHover}
      onClick={onSelect}
    >
      <TitleOverlay $hasLogo={Boolean(media.logo)}>{cardTitle}</TitleOverlay>
      {playback && (
        <ProgressTrack
          aria-label={playback.nextEpisode ? 'Next episode' : `${Math.round(percent)}% watched`}
        >
          <ProgressFill $percent={percent} />
        </ProgressTrack>
      )}
    </Card>
  );
});
