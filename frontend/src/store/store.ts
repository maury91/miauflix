import { authApi } from '@features/auth/api/auth.api';
import { configApi } from '@features/config/api/config.api';
import { homeFeedMiddleware } from '@features/home-feed/homeFeed.middleware';
import { homeFeedSlice } from '@features/home-feed/homeFeed.slice';
import { listsApi } from '@features/media/api/lists.api';
import { mediaApi } from '@features/media/api/media.api';
import { notificationsApi } from '@features/notifications/api/notifications.api';
import { playbackApi } from '@features/player/api/playback.api';
import { preloadApi } from '@features/preload/api/preload.api';
import { profilesApi } from '@features/profiles/api/profiles.api';
import { profileSessionMiddleware } from '@features/profiles/profileSession.middleware';
import { progressApi } from '@features/progress/api/progress.api';
import { realtimeMiddleware } from '@features/realtime/realtime.middleware';
import { searchMiddleware } from '@features/search/search.middleware';
import { setupApi } from '@features/setup/api/setup.api';
import { sourcesApi } from '@features/sources/api/sources.api';
import { storageApi } from '@features/storage/api/storage.api';
import { configureStore } from '@reduxjs/toolkit';
import { appStateSlice } from '@store/slices/appState';
import { artworkSlice } from '@store/slices/artwork';
import { authSlice } from '@store/slices/auth';
import { detailsNavigationSlice } from '@store/slices/detailsNavigation';
import { homeNavigationSlice } from '@store/slices/homeNavigation';
import { measurementsSlice } from '@store/slices/measurements';
import { realtimeSlice } from '@store/slices/realtime';
import { searchSlice } from '@store/slices/search';

export const store = configureStore({
  reducer: {
    [authApi.reducerPath]: authApi.reducer,
    [listsApi.reducerPath]: listsApi.reducer,
    [mediaApi.reducerPath]: mediaApi.reducer,
    [notificationsApi.reducerPath]: notificationsApi.reducer,
    [playbackApi.reducerPath]: playbackApi.reducer,
    [preloadApi.reducerPath]: preloadApi.reducer,
    [profilesApi.reducerPath]: profilesApi.reducer,
    [progressApi.reducerPath]: progressApi.reducer,
    [configApi.reducerPath]: configApi.reducer,
    [setupApi.reducerPath]: setupApi.reducer,
    [sourcesApi.reducerPath]: sourcesApi.reducer,
    [storageApi.reducerPath]: storageApi.reducer,
    [authSlice.name]: authSlice.reducer,
    [artworkSlice.name]: artworkSlice.reducer,
    [detailsNavigationSlice.name]: detailsNavigationSlice.reducer,
    [appStateSlice.name]: appStateSlice.reducer,
    [homeFeedSlice.name]: homeFeedSlice.reducer,
    [homeNavigationSlice.name]: homeNavigationSlice.reducer,
    [measurementsSlice.name]: measurementsSlice.reducer,
    [realtimeSlice.name]: realtimeSlice.reducer,
    [searchSlice.name]: searchSlice.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      listsApi.middleware,
      mediaApi.middleware,
      notificationsApi.middleware,
      playbackApi.middleware,
      preloadApi.middleware,
      profilesApi.middleware,
      progressApi.middleware,
      configApi.middleware,
      setupApi.middleware,
      sourcesApi.middleware,
      storageApi.middleware,
      searchMiddleware,
      realtimeMiddleware,
      homeFeedMiddleware,
      profileSessionMiddleware
    ),
});

// Auto-load sessions and setup status on store initialization (client-side only to avoid SSR side effects)
if (typeof window !== 'undefined') {
  store.dispatch(authApi.endpoints.listSessions.initiate(undefined));
  store.dispatch(setupApi.endpoints.checkSetupStatus.initiate(undefined));
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
