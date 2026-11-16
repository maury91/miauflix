import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import { MediaTile } from '@shared/design-system';
import { artworkUrl, getMediaTitle } from '@shared/lib/media.utils';
import type { RootState } from '@store/store';
import { useSelector } from 'react-redux';

interface MediaCardProps {
  media: MediaDto;
  /** The card width (px), for the artwork size requested. */
  width: number;
  /** Virtual focus, from the carousel. */
  focused: boolean;
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
 * playback progress, the episode in progress). The carousel owns movement and passes its focus;
 * the tile fills the carousel's slot.
 */
export function MediaCard({ media, onSelect, progress: playback, focused, width }: MediaCardProps) {
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
    <MediaTile
      title={title}
      supportingText={episode}
      artwork={
        selectedArtwork.backdrop ? artworkUrl(selectedArtwork.backdrop, 'card', width) : null
      }
      logo={selectedArtwork.logo ? artworkUrl(selectedArtwork.logo, 'logo', width * 0.7) : null}
      labelPlacement="overlay"
      progress={share}
      progressText={share === undefined ? undefined : `${Math.round(share * 100)}% watched`}
      focused={focused}
      // The selected card of the focused row, as Home has always marked it (end-to-end tests
      // find it by this)
      aria-current={focused || undefined}
      // Roving: the carousel's focused card is the row's one Tab stop
      tabIndex={focused ? 0 : -1}
      onClick={onSelect}
    />
  );
}
