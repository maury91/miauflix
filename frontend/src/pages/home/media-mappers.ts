import { mediaApi } from '@features/media/api/media.api';
import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import type { RootState } from '@store/store';

export { mediaFromMovie, mediaFromShow } from '@features/media/lib/media-cards';

/**
 * A selector for a title's card from the cached batch card, or null while it is not cached. The
 * card is the cached object itself, so it stays the same while the cache entry is unchanged and
 * memoized rows skip it. Build it once per title and reuse it: each call to an endpoint's
 * `select` builds a new memoized selector.
 */
export function cardSelector(
  kind: 'movie' | 'show',
  mediaId: number
): (state: Pick<RootState, 'mediaApi'>) => MediaDto | null {
  const select = mediaApi.endpoints.getMediaCard.select({
    mediaType: kind === 'movie' ? 'movie' : 'tv',
    mediaId,
  });
  return state => select(state).data ?? null;
}

/** The title a progress entry belongs to: a movie, or the show of an episode. */
export const progressTitle = (entry: ProgressEntry) =>
  entry.playable.kind === 'movie'
    ? { kind: 'movie' as const, mediaId: entry.playable.mediaId }
    : { kind: 'show' as const, mediaId: entry.playable.showMediaId };

/** The card for a progress entry from cached catalog data (see cardSelector). */
export function mediaFromProgress(
  state: Pick<RootState, 'mediaApi'>,
  entry: ProgressEntry
): MediaDto | null {
  const { kind, mediaId } = progressTitle(entry);
  return cardSelector(kind, mediaId)(state);
}
