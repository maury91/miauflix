import { authApi } from '@features/auth/api/auth.api';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';

export const store = configureStore({
  reducer: {
    [authApi.reducerPath]: authApi.reducer,
    [authSlice.name]: authSlice.reducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(authApi.middleware),
});

// Auto-load sessions on store initialization
store.dispatch(authApi.endpoints.listSessions.initiate(undefined));

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
