import { listsApi } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import { notificationsApi } from '@features/notifications/api/notifications.api';
import { playbackApi } from '@features/player/api/playback.api';
import { preloadApi } from '@features/preload/api/preload.api';
import { PRELOAD_CLIENT_ID } from '@features/preload/lib/intent-client';
import { applyProgressUpdate, progressApi } from '@features/progress/api/progress.api';
import { RealtimeClient } from '@features/realtime/realtime.client';
import type { ProgressRequest, SearchClientMessage } from '@miauflix/backend';
import type { ArtworkUpdate, MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { createAction, type Middleware } from '@reduxjs/toolkit';
import { artworkActions } from '@store/slices/artwork';
import { selectCurrentSessionId } from '@store/slices/auth';
import { realtimeActions } from '@store/slices/realtime';
import { searchActions } from '@store/slices/search';
import type { AppDispatch, RootState } from '@store/store';

import type { RealtimeFocus, RealtimeMap } from './realtime.client';

export const realtimeRuntimeActions = {
  publishFocusRequested: createAction<Omit<RealtimeFocus, 'type' | 'clientSequence'>>(
    'realtimeRuntime/publishFocusRequested'
  ),
  publishMapRequested: createAction<Omit<RealtimeMap, 'type' | 'clientSequence'>>(
    'realtimeRuntime/publishMapRequested'
  ),
  artworkSubscriptionsChanged: createAction<MediaRef[]>(
    'realtimeRuntime/artworkSubscriptionsChanged'
  ),
  searchRequested: createAction<SearchClientMessage>('realtimeRuntime/searchRequested'),
};

let activeClient: RealtimeClient | null = null;
let activeSession: string | null = null;
let activeGeneration = 0;
let visibilityListener: (() => void) | null = null;
let artworkSubscriptions: MediaRef[] = [];
const artworkKey = (ref: MediaRef) => `${ref.mediaType}:${ref.mediaId}`;
/** About a frame: long enough to gather a burst of pushes, short enough not to show. */
const ARTWORK_BATCH_MS = 16;

function stopClient(): void {
  if (visibilityListener && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityListener);
  }
  visibilityListener = null;
  const client = activeClient;
  activeClient = null;
  client?.stop();
}

/** Own the authenticated socket independently of any rendered page. */
export const realtimeMiddleware: Middleware = api => next => action => {
  // Only the socket needs these: reducers would ignore them, yet every subscriber would still be
  // notified, and Home sends them as it moves.
  if (realtimeRuntimeActions.publishFocusRequested.match(action)) {
    activeClient?.publishFocus(action.payload);
    return action;
  }
  if (realtimeRuntimeActions.publishMapRequested.match(action)) {
    activeClient?.publishMap(action.payload);
    return action;
  }
  if (realtimeRuntimeActions.artworkSubscriptionsChanged.match(action)) {
    artworkSubscriptions = action.payload;
    activeClient?.setArtworkSubscriptions(artworkSubscriptions);
    return action;
  }
  const result = next(action);
  const session = selectCurrentSessionId(api.getState() as RootState);

  if (session !== activeSession) {
    activeSession = session;
    activeGeneration += 1;
    const generation = activeGeneration;
    stopClient();
    api.dispatch(realtimeActions.resetRealtimeState());
    api.dispatch(listsApi.util.resetApiState());
    api.dispatch(progressApi.util.resetApiState());
    api.dispatch(playbackApi.util.resetApiState());
    api.dispatch(preloadApi.util.resetApiState());
    api.dispatch(notificationsApi.util.resetApiState());
    if (session && typeof window !== 'undefined') {
      const isCurrentClient = () => activeGeneration === generation && activeSession === session;
      let connectedBefore = false;
      /** Artwork pushes waiting for the next batch (see ARTWORK_BATCH_MS). */
      const pendingArtwork: ArtworkUpdate[] = [];
      /** The last status message per type and title, to drop exact repeats. */
      const lastStatus = new Map<string, string>();
      const client = new RealtimeClient(
        session,
        PRELOAD_CLIENT_ID,
        message => {
          if (!isCurrentClient()) return;
          // The backend repeats unchanged statuses several times a second; each dispatch would
          // notify every subscriber even though the state stays the same.
          const key = JSON.stringify(message, (field: string, value: unknown) =>
            field === 'focusSequence' ? undefined : value
          );
          // A title gets both source and warmup statuses, interleaved: compare each with its own.
          const slot = `${message.type}:${message.mediaId}`;
          if (lastStatus.get(slot) === key) return;
          lastStatus.set(slot, key);
          api.dispatch(realtimeActions.statusReceived(message));
        },
        ready => {
          if (!isCurrentClient()) return;
          api.dispatch(realtimeActions.connectionChanged(ready));
          if (!ready) return;
          // The gateway does not replay availability changes missed while disconnected, so
          // pushed values may be stale: drop them and refetch the details that carry them.
          if (connectedBefore) {
            api.dispatch(realtimeActions.availabilityCleared());
            api.dispatch(mediaApi.util.invalidateTags(['Movie', 'Season']));
          }
          connectedBefore = true;
        },
        update => {
          if (!isCurrentClient()) return;
          // Pushes come in bursts (a row's titles at once): store them in one update per frame.
          pendingArtwork.push(update);
          if (pendingArtwork.length > 1) return;
          setTimeout(() => {
            // Titles unsubscribed meanwhile (Home unmounted) were removed: keep them removed.
            const subscribed = new Set(artworkSubscriptions.map(artworkKey));
            const updates = pendingArtwork
              .splice(0)
              .filter(item => subscribed.has(artworkKey(item)));
            if (isCurrentClient() && updates.length)
              api.dispatch(artworkActions.receivedMany(updates));
          }, ARTWORK_BATCH_MS);
        },
        message => {
          if (isCurrentClient()) api.dispatch(realtimeActions.playbackDeliveryReceived(message));
        },
        message => {
          if (isCurrentClient()) api.dispatch(searchActions.serverMessage(message));
        },
        message => {
          if (isCurrentClient()) api.dispatch(realtimeActions.sourceReceived(message));
        },
        message => {
          if (isCurrentClient()) api.dispatch(realtimeActions.playbackPiecesReceived(message));
        }
      );
      activeClient = client;
      visibilityListener = () => client.setVisible(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', visibilityListener);
      client.start();
      client.setVisible(document.visibilityState !== 'hidden');
      client.setArtworkSubscriptions(artworkSubscriptions);
    }
  }

  if (realtimeRuntimeActions.searchRequested.match(action)) {
    activeClient?.sendSearch(action.payload);
  }

  return result;
};

/** Send progress over the socket when possible, otherwise persist through the existing HTTP API. */
export function saveProgressWithRealtime(update: ProgressRequest) {
  return async (dispatch: AppDispatch): Promise<void> => {
    if (activeClient?.publishProgress(update)) {
      applyProgressUpdate(dispatch, update);
      return;
    }
    await dispatch(progressApi.endpoints.updateProgress.initiate(update))
      .unwrap()
      .catch(() => {});
  };
}
