import { mediaApi } from '@features/media/api/media.api';
import type { MediaDto, ProgressEntry } from '@miauflix/backend';
import type { AppDispatch, RootState } from '@store/store';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { firstSeason } from '../first-season';

/** Cached details younger than this (seconds) are not fetched again on focus. */
const PREFETCH_IF_OLDER_THAN_S = 30;

/**
 * While a card is focused, fetch what its details page needs: the title, and for a show the
 * season the page will open on, so Enter shows it complete.
 */
export function useFocusPrefetch(
  focused: MediaDto | null,
  sessionId: string | null,
  progress: ProgressEntry[]
) {
  const dispatch = useDispatch<AppDispatch>();
  const mediaId = focused?.mediaId;
  const kind = focused ? (focused._type === 'movie' ? 'movie' : 'show') : null;

  useEffect(() => {
    if (!sessionId || mediaId === undefined || !kind) return;
    dispatch(
      mediaApi.util.prefetch(kind === 'movie' ? 'getMovie' : 'getShow', mediaId, {
        ifOlderThan: PREFETCH_IF_OLDER_THAN_S,
      })
    );
  }, [dispatch, kind, mediaId, sessionId]);

  const show = useSelector((state: RootState) =>
    kind === 'show' && mediaId !== undefined
      ? mediaApi.endpoints.getShow.select(mediaId)(state).data
      : undefined
  );
  const season = show ? firstSeason(show, progress) : undefined;
  const showId = show?.mediaId;
  useEffect(() => {
    if (!sessionId || showId === undefined || season === undefined) return;
    dispatch(
      mediaApi.util.prefetch(
        'getSeason',
        { showId, season },
        { ifOlderThan: PREFETCH_IF_OLDER_THAN_S }
      )
    );
  }, [dispatch, season, sessionId, showId]);
}
