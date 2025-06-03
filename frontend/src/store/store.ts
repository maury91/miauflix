import { configureStore } from '@reduxjs/toolkit';
import { listsApi } from './api/lists';
import { useDispatch, useSelector } from 'react-redux';
import { usersApi } from './api/users';
import app from './slices/app';
import home from './slices/home';
import profileSelection from './slices/profileSelection';
import resume from './slices/resume';
import stream from './slices/stream';
import ui from './slices/ui';
import { categoriesApi } from './api/categories';
import { mediasApi } from './api/medias';
import { progressApi } from './api/progress';

export const store = configureStore({
  reducer: {
    app,
    home,
    profileSelection,
    resume,
    stream,
    ui,
    [listsApi.reducerPath]: listsApi.reducer,
    [usersApi.reducerPath]: usersApi.reducer,
    [categoriesApi.reducerPath]: categoriesApi.reducer,
    [mediasApi.reducerPath]: mediasApi.reducer,
    [progressApi.reducerPath]: progressApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().concat(
      listsApi.middleware,
      usersApi.middleware,
      categoriesApi.middleware,
      mediasApi.middleware,
      progressApi.middleware
    ),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
