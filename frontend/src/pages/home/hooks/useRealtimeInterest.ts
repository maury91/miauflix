import type { RealtimeMediaRef } from '@features/realtime/realtime.client';
import { realtimeRuntimeActions } from '@features/realtime/realtime.middleware';
import type { MediaDto } from '@miauflix/backend';
import type { AppDispatch } from '@store/store';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import type { CategoryRowHandle } from '../components/CategoryRow';
import { buildHomeRealtimeInterest } from '../homeInterest';
import type { HomeView } from './useMediaRoute';

const toRealtimeMedia = (media: MediaDto | null): RealtimeMediaRef | null =>
  media ? { kind: media._type === 'movie' ? 'movie' : 'show', mediaId: media.mediaId } : null;

/**
 * Publish what the viewer is looking at (the focused title and the cards around it in the
 * mounted rows) over realtime, so the backend prepares what is likely to be opened next.
 *
 * @returns `publish`, for rows to call when their window moves; it also runs on every change.
 */
export function useRealtimeInterest({
  rowRefs,
  rowCount,
  activeCategory,
  selectedMedia,
  subtitleLanguage,
  view,
}: {
  rowRefs: MutableRefObject<Map<number, CategoryRowHandle>>;
  rowCount: number;
  activeCategory: number;
  selectedMedia: MediaDto | null;
  subtitleLanguage: string;
  view: HomeView;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const revision = useRef(0);

  const publish = useCallback(() => {
    const rowWindows = Array.from({ length: rowCount }, (_, rowIndex) => {
      const window = rowRefs.current.get(rowIndex)?.getInterestWindow?.();
      return window
        ? {
            media: window.media.map(toRealtimeMedia),
            center: window.center,
            visible: window.visible,
          }
        : undefined;
    });
    const interest = buildHomeRealtimeInterest({
      activeCategory,
      rowCount,
      rowWindows,
      selectedMedia: toRealtimeMedia(selectedMedia),
      view,
    });
    const navigationRevision = ++revision.current;
    dispatch(
      realtimeRuntimeActions.publishFocusRequested({
        navigationRevision,
        ...interest.focus,
        subtitleLanguage,
      })
    );
    dispatch(realtimeRuntimeActions.publishMapRequested({ navigationRevision, ...interest.map }));
  }, [activeCategory, dispatch, rowCount, rowRefs, selectedMedia, subtitleLanguage, view]);

  useEffect(() => {
    publish();
  }, [publish]);

  return publish;
}
