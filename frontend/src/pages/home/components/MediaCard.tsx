import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import { MediaTile } from '@shared/design-system';
import { artworkUrl, getMediaTitle } from '@shared/lib/media.utils';
import type { RootState } from '@store/store';
import { forwardRef } from 'react';
import { useSelector } from 'react-redux';

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

/** The watched share, 0 to 1, or nothing before playback started. */
function watchedShare(playback: ProgressEntry | undefined): number | undefined {
  if (!playback) return undefined;
  if (playback.state === 'completed') return 1;
  const share = playback.positionSeconds / playback.durationSeconds;
  return Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 0;
}

/**
 * A Home row's media: the design system's MediaTile, adapted from the media DTO (live artwork,
 * playback progress, the episode in progress). The row owns movement and passes the selection as
 * the tile's focus; the tile draws it. Sized by the row's geometry in exact pixels.
 */
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
  const share = watchedShare(playback);
  const episode =
    media._type === 'tvshow' && playback?.playable.kind === 'episode'
      ? `S${playback.playable.seasonNumber} E${playback.playable.episodeNumber}`
      : undefined;
  return (
    // The row lays cards out by their exact width; the tile fills it
    <div style={{ flex: `0 0 ${width}px`, width }}>
      <MediaTile
        ref={ref}
        title={title}
        supportingText={episode}
        artwork={
          selectedArtwork.backdrop ? artworkUrl(selectedArtwork.backdrop, 'card', width) : null
        }
        logo={selectedArtwork.logo ? artworkUrl(selectedArtwork.logo, 'logo', width * 0.7) : null}
        labelPlacement="overlay"
        progress={share}
        progressText={share === undefined ? undefined : `${Math.round(share * 100)}% watched`}
        focused={selected}
        aria-current={selected ? 'true' : undefined}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onMouseEnter={onHover}
        onClick={onSelect}
      />
    </div>
  );
});
