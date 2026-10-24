import {
  useRemoveIntentMutation,
  useUpdateIntentMutation,
} from '@features/preload/api/preload.api';
import { nextPreloadSequence, PRELOAD_CLIENT_ID } from '@features/preload/lib/intent-client';
import type {
  MediaDto,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
} from '@miauflix/backend';
import { selectPreparationByMediaId, selectRealtimeReady } from '@store/slices/realtime';
import { useCallback, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import type { HomeView } from './useMediaRoute';
import { useSessionChange } from './useSessionChange';

/** How often the focused title's preload lease is renewed when realtime is unavailable. */
const INTENT_HEARTBEAT_MS = 5_000;
/** Movies whose last discovered source is remembered for an instant hero on return. */
const SOURCE_CACHE_LIMIT = 256;

/**
 * What the hero and details show about a movie's sources. A remembered source wins while the
 * server is still checking; otherwise the server's answer for this movie, or an error when the
 * intent request for this movie failed. Shows have no preparation.
 */
export function resolvePreparation({
  selectedMedia,
  response,
  cachedSource,
  intentFailedForMovieId,
}: {
  selectedMedia: MediaDto | null;
  response: PreloadPreparationSnapshot | null | undefined;
  cachedSource: PreloadPreparationSource | undefined;
  intentFailedForMovieId: number | null;
}): PreloadPreparationSnapshot | null {
  if (selectedMedia?._type !== 'movie') return null;
  const mediaId = selectedMedia.mediaId;
  const matched =
    response?.playable.kind === 'movie' && response.playable.mediaId === mediaId ? response : null;
  if (cachedSource && (!matched || matched.state === 'checking')) {
    return {
      playable: { kind: 'movie', mediaId },
      state: 'source_found',
      source: cachedSource,
      // A prior visit's buffer may have been paused or evicted. Only current
      // backend responses can report live warmup progress.
      warmup: matched?.warmup ?? { state: 'not_requested' },
    };
  }
  if (matched) return matched;
  if (intentFailedForMovieId === mediaId) {
    return {
      playable: { kind: 'movie', mediaId },
      state: 'error',
      source: null,
      warmup: { state: 'not_requested' },
    };
  }
  return null;
}

/**
 * Tell the backend which title is focused so it can find and warm its sources, and report what
 * it found. Realtime pushes preparation updates; without it, a heartbeat renews the lease.
 * The lease survives moving from browse to details, so warmup builds on what browsing found.
 */
export function useHomePreparation({
  sessionId,
  selectedMedia,
  view,
  subtitleLanguage,
}: {
  sessionId: string | null;
  selectedMedia: MediaDto | null;
  view: HomeView;
  subtitleLanguage: string;
}): PreloadPreparationSnapshot | null {
  const [updateIntent, intentState] = useUpdateIntentMutation();
  const [removeIntent] = useRemoveIntentMutation();
  const realtimeReady = useSelector(selectRealtimeReady);
  const realtimePreparation = useSelector(selectPreparationByMediaId(selectedMedia?.mediaId));
  const lastIntentSequence = useRef(0);
  const latestIntentSession = useRef<string | null>(sessionId);
  const lastPreparation = useRef<PreloadPreparationSnapshot | null>(null);
  const lastPreparationSession = useRef(sessionId);
  const sourceCache = useRef(new Map<number, PreloadPreparationSource>());

  const resetIntentState = intentState.reset;
  useSessionChange(sessionId, () => {
    latestIntentSession.current = null;
    lastPreparationSession.current = sessionId;
    lastPreparation.current = null;
    sourceCache.current.clear();
    resetIntentState?.();
  });

  const publishIntent = useCallback(
    (request: Parameters<typeof updateIntent>[0]) => {
      if (!sessionId) return;
      latestIntentSession.current = sessionId;
      return updateIntent(request);
    },
    [sessionId, updateIntent]
  );

  const focusedMediaId = selectedMedia?.mediaId;
  const focusedKind = selectedMedia ? (selectedMedia._type === 'movie' ? 'movie' : 'show') : null;
  useEffect(() => {
    if (!sessionId || realtimeReady || focusedMediaId === undefined || !focusedKind) return;
    // Catalog updates can recreate card DTOs; only a focus change renews the lease early.
    const focused = { kind: focusedKind, mediaId: focusedMediaId };
    const publish = () => {
      if (document.visibilityState === 'hidden') return;
      const sequence = nextPreloadSequence();
      lastIntentSequence.current = sequence;
      void publishIntent({
        clientId: PRELOAD_CLIENT_ID,
        intent: {
          sequence,
          subtitleLanguage,
          view,
          focused: view === 'player' ? null : focused,
          reachable: [],
        },
      });
    };
    publish();
    const heartbeat = window.setInterval(publish, INTENT_HEARTBEAT_MS);
    return () => window.clearInterval(heartbeat);
  }, [
    focusedKind,
    focusedMediaId,
    publishIntent,
    realtimeReady,
    sessionId,
    subtitleLanguage,
    view,
  ]);

  useEffect(() => {
    if (!sessionId) return;
    return () => {
      if (lastIntentSequence.current === 0) return;
      void removeIntent({
        clientId: PRELOAD_CLIENT_ID,
        sequence: lastIntentSequence.current,
        session: sessionId,
      });
    };
  }, [removeIntent, sessionId]);

  // Results of an intent sent for a previous session are not this account's.
  const current = Boolean(sessionId && latestIntentSession.current === sessionId);
  const intentData = current ? intentState.data : undefined;
  if (intentData) {
    lastPreparation.current = intentData.preparation ?? null;
    lastPreparationSession.current = sessionId;
  }
  const response =
    realtimePreparation ??
    (intentData
      ? intentData.preparation
      : current && intentState.isLoading && lastPreparationSession.current === sessionId
        ? lastPreparation.current
        : undefined);

  useEffect(() => {
    if (response?.playable.kind !== 'movie') return;
    const mediaId = response.playable.mediaId;
    if (response.source) {
      sourceCache.current.delete(mediaId);
      sourceCache.current.set(mediaId, response.source);
      if (sourceCache.current.size > SOURCE_CACHE_LIMIT) {
        sourceCache.current.delete(sourceCache.current.keys().next().value!);
      }
    } else if (response.state === 'no_source') {
      sourceCache.current.delete(mediaId);
    }
  }, [response]);

  const failedFocus =
    current && intentState.error ? intentState.originalArgs?.intent.focused : null;
  return resolvePreparation({
    selectedMedia,
    response,
    cachedSource:
      selectedMedia?._type === 'movie' ? sourceCache.current.get(selectedMedia.mediaId) : undefined,
    intentFailedForMovieId: failedFocus?.kind === 'movie' ? failedFocus.mediaId : null,
  });
}
