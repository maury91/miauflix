import type { MediaDto } from '@miauflix/backend-client';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

import type { AuthState, InitializationState } from '@/types/auth';

import type { Page } from '../../types';
import { listsApi } from '../api/lists';

export interface AppState {
  currentPage: Page;
  currentMedia: MediaDto | null;
  currentUserId: number;
  currentProfile: string | null;
  backgrounds: string[];
  shuffledBackgrounds: string[];
  logos: string[];
  initialization: InitializationState;
  auth: AuthState;
}

const initialState: AppState = {
  currentPage: 'login',
  currentMedia: null,
  currentUserId: 0,
  currentProfile: null,
  backgrounds: [],
  shuffledBackgrounds: [],
  logos: [],
  initialization: {
    isComplete: false,
    serverAvailable: false,
    profileCount: 0,
    currentStep: 'health',
    error: undefined,
  },
  auth: {
    currentProfileId: undefined,
    isAuthenticated: false,
  },
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    chooseProfile: (state, action: PayloadAction<{ id: number; slug: string }>) => {
      state.currentPage = 'home/categories';
      state.currentUserId = action.payload.id;
      state.currentProfile = action.payload.slug;
    },
    navigateTo: (state, actions: PayloadAction<Page>) => {
      state.currentPage = actions.payload;
    },
    setCurrentMedia: (state, action: PayloadAction<MediaDto | null>) => {
      state.currentMedia = action.payload;
    },
    setCurrentProfile: (state, action: PayloadAction<string | undefined>) => {
      state.auth.currentProfileId = action.payload;
      state.auth.isAuthenticated = !!action.payload;
    },
    updateInitialization: (state, action: PayloadAction<Partial<InitializationState>>) => {
      state.initialization = { ...state.initialization, ...action.payload };
    },
    resetInitialization: state => {
      state.initialization = {
        isComplete: false,
        serverAvailable: false,
        profileCount: 0,
        currentStep: 'health',
        error: undefined,
      };
    },
  },
  extraReducers: builder => {
    builder.addMatcher(listsApi.endpoints.getList.matchFulfilled, (state, action) => {
      const backgroundsAndLogos = action.payload.results.map((movie: MediaDto) => ({
        backdrop: movie.backdrop,
        logo: movie._type === 'movie' ? movie.logo : undefined,
      }));
      const backgroundsAndLogosShuffled = [...backgroundsAndLogos].sort(() => Math.random() - 0.5);
      state.backgrounds = backgroundsAndLogos.map(({ backdrop }) => backdrop ?? '');
      state.shuffledBackgrounds = backgroundsAndLogosShuffled.map(({ backdrop }) => backdrop ?? '');
      state.logos = backgroundsAndLogosShuffled.map(({ logo }) => logo ?? '');
    });
  },
});

export const {
  chooseProfile,
  navigateTo,
  setCurrentMedia,
  setCurrentProfile,
  updateInitialization,
  resetInitialization,
} = appSlice.actions;
export default appSlice.reducer;
