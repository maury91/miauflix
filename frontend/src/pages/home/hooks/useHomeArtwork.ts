import { realtimeRuntimeActions } from '@features/realtime/realtime.middleware';
import type { MediaDto } from '@miauflix/backend';
import type { ArtworkUpdate, MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { artworkActions } from '@store/slices/artwork';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { useSessionChange } from './useSessionChange';

/** At most this many titles stay subscribed to live artwork updates. */
const MAX_ARTWORK_SUBSCRIPTIONS = 5_000;

const mediaRef = (media: MediaDto): MediaRef => ({
  mediaType: media._type === 'movie' ? 'movie' : 'tv',
  mediaId: media.mediaId,
});

const artworkFromMedia = (media: MediaDto): ArtworkUpdate => ({
  ...mediaRef(media),
  backdrop: media.backdrop ?? '',
  logo: media.logo ?? '',
  heroLogo: media.heroLogo ?? media.logo ?? '',
  artworkRevision: media.artworkRevision ?? 0,
  cardLogoStatus: media.cardLogoStatus ?? 'pending',
  heroLogoStatus: media.heroLogoStatus ?? 'pending',
});

const refKey = (ref: MediaRef) => `${ref.mediaType}:${ref.mediaId}`;

/**
 * Keep live artwork subscribed for every title Home shows: the loaded cards of each row,
 * Continue watching, and the hero. Titles that leave Home are unsubscribed and forgotten.
 *
 * @returns The callback rows report their loaded cards to.
 */
export function useHomeArtwork({
  rowSlugs,
  continueMedia,
  selectedMedia,
  sessionId,
}: {
  rowSlugs: readonly string[];
  continueMedia: readonly MediaDto[];
  selectedMedia: MediaDto | null;
  sessionId: string | null;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const [loadedRefsByRow, setLoadedRefsByRow] = useState<Record<string, MediaRef[]>>({});
  const subscribed = useRef<MediaRef[]>([]);

  useSessionChange(sessionId, () => setLoadedRefsByRow({}));

  const onMediaLoaded = useCallback(
    (slug: string, media: MediaDto[]) => {
      const refs = media.map(mediaRef);
      for (const item of media) dispatch(artworkActions.received(artworkFromMedia(item)));
      setLoadedRefsByRow(previous => {
        const current = previous[slug];
        const unchanged =
          current?.length === refs.length &&
          current.every((ref, index) => refKey(ref) === refKey(refs[index]!));
        return unchanged ? previous : { ...previous, [slug]: refs };
      });
    },
    [dispatch]
  );

  // Rows that left the feed no longer hold artwork.
  const rowSlugsKey = rowSlugs.join('\n');
  useEffect(() => {
    const active = new Set(rowSlugsKey.split('\n'));
    setLoadedRefsByRow(previous => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([slug]) => active.has(slug))
      );
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [rowSlugsKey]);

  const artworkRefs = useMemo(() => {
    const byKey = new Map<string, MediaRef>();
    const add = (ref: MediaRef) => byKey.set(refKey(ref), ref);
    if (selectedMedia) add(mediaRef(selectedMedia));
    for (const media of continueMedia) add(mediaRef(media));
    for (const ref of Object.values(loadedRefsByRow).flat()) add(ref);
    return [...byKey.values()].slice(0, MAX_ARTWORK_SUBSCRIPTIONS);
  }, [continueMedia, loadedRefsByRow, selectedMedia]);

  useEffect(() => {
    const next = new Set(artworkRefs.map(refKey));
    const removed = subscribed.current.filter(ref => !next.has(refKey(ref)));
    dispatch(realtimeRuntimeActions.artworkSubscriptionsChanged(artworkRefs));
    if (removed.length) dispatch(artworkActions.removed(removed));
    subscribed.current = artworkRefs;
  }, [artworkRefs, dispatch]);

  useEffect(
    () => () => {
      dispatch(realtimeRuntimeActions.artworkSubscriptionsChanged([]));
      if (subscribed.current.length) dispatch(artworkActions.removed(subscribed.current));
    },
    [dispatch]
  );

  // Continue watching and the hero do not come from a row, so record their artwork here.
  useEffect(() => {
    for (const media of [...continueMedia, ...(selectedMedia ? [selectedMedia] : [])])
      dispatch(artworkActions.received(artworkFromMedia(media)));
  }, [continueMedia, dispatch, selectedMedia]);

  return { onMediaLoaded };
}
