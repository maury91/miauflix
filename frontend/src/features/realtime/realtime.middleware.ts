import { listsApi } from '@features/media/api/lists.api';
import { notificationsApi } from '@features/notifications/api/notifications.api';
import { playbackApi } from '@features/player/api/playback.api';
import { preloadApi } from '@features/preload/api/preload.api';
import { PRELOAD_CLIENT_ID } from '@features/preload/lib/intent-client';
import { applyProgressUpdate, progressApi } from '@features/progress/api/progress.api';
import { RealtimeClient } from '@features/realtime/realtime.client';
import type { ProgressRequest } from '@miauflix/backend';
import type { MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { createAction, type Middleware } from '@reduxjs/toolkit';
import { artworkActions } from '@store/slices/artwork';
import { selectCurrentSessionId } from '@store/slices/auth';
import { realtimeActions } from '@store/slices/realtime';
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
};

let activeClient: RealtimeClient | null = null;
let activeSession: string | null = null;
let activeGeneration = 0;
let visibilityListener: (() => void) | null = null;
let artworkSubscriptions: MediaRef[] = [];

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
      const client = new RealtimeClient(
        session,
        PRELOAD_CLIENT_ID,
        message => {
          if (isCurrentClient()) api.dispatch(realtimeActions.statusReceived(message));
        },
        ready => {
          if (isCurrentClient()) api.dispatch(realtimeActions.connectionChanged(ready));
        },
        update => {
          if (isCurrentClient()) api.dispatch(artworkActions.received(update));
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

  if (realtimeRuntimeActions.publishFocusRequested.match(action)) {
    activeClient?.publishFocus(action.payload);
  } else if (realtimeRuntimeActions.publishMapRequested.match(action)) {
    activeClient?.publishMap(action.payload);
  } else if (realtimeRuntimeActions.artworkSubscriptionsChanged.match(action)) {
    artworkSubscriptions = action.payload;
    activeClient?.setArtworkSubscriptions(artworkSubscriptions);
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
