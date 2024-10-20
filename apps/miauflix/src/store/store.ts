import { configureStore } from '@reduxjs/toolkit';
import { moviesApi } from './api/movies';
import { useDispatch, useSelector } from 'react-redux';
import { usersApi } from './api/users';
import app from './slices/app';

export const store = configureStore({
  reducer: {
    app,
    [moviesApi.reducerPath]: moviesApi.reducer,
    [usersApi.reducerPath]: usersApi.reducer,
    // movies: moviesSlice.reducer,
    // profiles: profilesSlice.reducer,
    // user: userSlice.reducer,
    // theme: themeSlice.reducer,
    // search: searchSlice.reducer,
    // player: playerSlice.reducer,
    // toast: toastSlice.reducer,
    // modal: modalSlice.reducer,
    // notifications: notificationsSlice.reducer,
    // settings: settingsSlice.reducer,
    // playerSettings: playerSettingsSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(moviesApi.middleware, usersApi.middleware),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
