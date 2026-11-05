import { configApi } from '@features/config/api/config.api';
import { listsApi } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import { notificationsApi } from '@features/notifications/api/notifications.api';
import { playbackApi } from '@features/player/api/playback.api';
import { preloadApi } from '@features/preload/api/preload.api';
import { progressApi } from '@features/progress/api/progress.api';
import { sourcesApi } from '@features/sources/api/sources.api';
import { storageApi } from '@features/storage/api/storage.api';
import type { Middleware } from '@reduxjs/toolkit';
import { writeStoredSessionId } from '@store/slices/auth';

/** Caches that hold one profile's data (lists, progress, notifications, ...). */
const PROFILE_APIS = [
  configApi,
  listsApi,
  mediaApi,
  notificationsApi,
  playbackApi,
  preloadApi,
  progressApi,
  sourcesApi,
  storageApi,
];

interface AuthSnapshot {
  auth: { currentSessionId: string | null };
}

/**
 * Remember the chosen profile for this app run, and drop the cached data of the previous one
 * when another profile starts watching, so it never shows someone else's lists.
 */
export const profileSessionMiddleware: Middleware = store => next => action => {
  const before = (store.getState() as AuthSnapshot).auth.currentSessionId;
  const result = next(action);
  const after = (store.getState() as AuthSnapshot).auth.currentSessionId;
  if (before !== after) {
    // A cleared session (an expired one, before the sessions are listed again) keeps the stored
    // choice: it is restored only if the server still lists it.
    if (after) writeStoredSessionId(after);
    if (before !== null) PROFILE_APIS.forEach(api => store.dispatch(api.util.resetApiState()));
  }
  return result;
};
