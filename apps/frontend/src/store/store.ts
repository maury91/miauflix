import { configureStore } from '@reduxjs/toolkit';
import { listsApi } from './api/lists';
import { useDispatch, useSelector } from 'react-redux';
import { usersApi } from './api/users';
import app from './slices/app';
import home from './slices/home';
import { categoriesApi } from './api/categories';

export const store = configureStore({
  reducer: {
    app,
    home,
    [listsApi.reducerPath]: listsApi.reducer,
    [usersApi.reducerPath]: usersApi.reducer,
    [categoriesApi.reducerPath]: categoriesApi.reducer,
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
    getDefaultMiddleware().concat(
      listsApi.middleware,
      usersApi.middleware,
      categoriesApi.middleware
    ),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
