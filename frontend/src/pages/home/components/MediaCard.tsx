import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import { MediaCard as ArtworkCard } from '@shared/ui/media-card/MediaCard';
import type { RootState } from '@store/store';
import { forwardRef } from 'react';
import { useSelector } from 'react-redux';

import { artworkUrl, getMediaTitle } from '../media.utils';

interface MediaCardProps {
  media: MediaDto;
  width: number;
  selected: boolean;
  tabIndex: number;
  onFocus: () => void;
  onHover: () => void;
  onSelect: () => void;
  /** This title's progress (see progressByMedia). */
  progress?: ProgressEntry;
}

/** Render a focusable media card with playback progress and the selected episode’s label when available. */
export const MediaCard = forwardRef<HTMLButtonElement, MediaCardProps>(function MediaCard(
  { media, onFocus, onHover, onSelect, progress: playback, selected, tabIndex, width },
  ref
) {
  const title = getMediaTitle(media);
  const mediaType = media._type === 'movie' ? 'movie' : 'tv';
  const artwork = useSelector(
    (state: RootState) => state.artwork.byMedia[`${mediaType}:${media.mediaId}`]
  );
  const currentRevision = media.artworkRevision ?? 0;
  const selectedArtwork = artwork && artwork.artworkRevision >= currentRevision ? artwork : media;
  const cardLogo = selectedArtwork.logo;
  const percent = playback
    ? playback.state === 'completed'
      ? 100
      : Math.max(0, Math.min(100, (playback.positionSeconds / playback.durationSeconds) * 100))
    : 0;
  const subtitle =
    media._type === 'tvshow' && playback?.playable.kind === 'episode'
      ? `S${playback.playable.seasonNumber} E${playback.playable.episodeNumber}`
      : undefined;
  return (
    <ArtworkCard
      ref={ref}
      backdrop={artworkUrl(selectedArtwork.backdrop, 'card', width)}
      logo={cardLogo ? artworkUrl(cardLogo, 'logo', width * 0.7) : undefined}
      title={title}
      subtitle={subtitle}
      focused={selected}
      width={width}
      progress={playback ? percent : undefined}
      aria-current={selected ? 'true' : undefined}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onMouseEnter={onHover}
      onClick={onSelect}
    />
  );
});
