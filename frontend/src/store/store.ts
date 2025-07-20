import { configureStore } from '@reduxjs/toolkit';
import { authApi } from './api/auth';
import { listsApi } from './api/lists';
import { moviesApi } from './api/movies';
import { progressApi } from './api/progress';
import { showsApi } from './api/shows';
import { mediasApi } from './api/medias';
import app from './slices/app';
import home from './slices/home';
import profileSelection from './slices/profileSelection';
import resume from './slices/resume';
import stream from './slices/stream';
import ui from './slices/ui';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

export const store = configureStore({
  reducer: {
    app,
    home,
    profileSelection,
    resume,
    stream,
    ui,
    [listsApi.reducerPath]: listsApi.reducer,
    [moviesApi.reducerPath]: moviesApi.reducer,
    [progressApi.reducerPath]: progressApi.reducer,
    [showsApi.reducerPath]: showsApi.reducer,
    [mediasApi.reducerPath]: mediasApi.reducer,
    [authApi.reducerPath]: authApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().concat(
      listsApi.middleware,
      moviesApi.middleware,
      progressApi.middleware,
      showsApi.middleware,
      mediasApi.middleware,
      authApi.middleware
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
