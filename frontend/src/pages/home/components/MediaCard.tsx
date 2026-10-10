import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import { MediaCard as ArtworkCard } from '@shared/ui/media-card/MediaCard';
import type { RootState } from '@store/store';
import { forwardRef } from 'react';
import { useSelector } from 'react-redux';

import { getImageUrl, getMediaTitle } from '../media.utils';

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
  const mediaType = media._type === 'movie' ? 'movie' : 'tv';
  const artwork = useSelector(
    (state: RootState) => state.artwork.byMedia[`${mediaType}:${media.mediaId}`]
  );
  const currentRevision = media.artworkRevision ?? 0;
  const cardLogo =
    artwork && artwork.artworkRevision >= currentRevision ? artwork.logo : media.logo;
  const playback = progressForMedia(progress, media);
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
      backdrop={getImageUrl(media.backdrop)}
      logo={cardLogo ? getImageUrl(cardLogo) : undefined}
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
