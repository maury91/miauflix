import { authApi } from '@features/auth/api/auth.api';
import { configApi } from '@features/config/api/config.api';
import { listsApi } from '@features/media/api/lists.api';
import { setupApi } from '@features/setup/api/setup.api';
import { configureStore } from '@reduxjs/toolkit';
import { appStateSlice } from '@store/slices/appState';
import { authSlice } from '@store/slices/auth';

export const store = configureStore({
  reducer: {
    [authApi.reducerPath]: authApi.reducer,
    [listsApi.reducerPath]: listsApi.reducer,
    [configApi.reducerPath]: configApi.reducer,
    [setupApi.reducerPath]: setupApi.reducer,
    [authSlice.name]: authSlice.reducer,
    [appStateSlice.name]: appStateSlice.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      listsApi.middleware,
      configApi.middleware,
      setupApi.middleware
    ),
});

// Auto-load sessions and setup status on store initialization (client-side only to avoid SSR side effects)
if (typeof window !== 'undefined') {
  store.dispatch(authApi.endpoints.listSessions.initiate(undefined));
  store.dispatch(setupApi.endpoints.checkSetupStatus.initiate(undefined));
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
