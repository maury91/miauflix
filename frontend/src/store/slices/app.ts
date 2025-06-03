import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listsApi } from '../api/lists';
import { Page } from '../../types';
import { MediaDto } from '@miauflix/types';

export interface AppState {
  currentPage: Page;
  currentMedia: MediaDto | null;
  currentUserId: number;
  currentProfile: string | null;
  backgrounds: string[];
  shuffledBackgrounds: string[];
  logos: string[];
}

const initialState: AppState = {
  currentPage: 'profile-selection',
  currentMedia: null,
  currentUserId: 0,
  currentProfile: null,
  backgrounds: [],
  shuffledBackgrounds: [],
  logos: [],
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
  },
  extraReducers: builder => {
    builder.addMatcher(listsApi.endpoints.getList.matchFulfilled, (state, action) => {
      const backgroundsAndLogos = action.payload.data.map(movie => ({
        backdrop: movie.images.backdrops.length ? movie.images.backdrops[0] : movie.images.backdrop,
        logo: movie.images.logos[0],
      }));
      const backgroundsAndLogosShuffled = [...backgroundsAndLogos].sort(() => Math.random() - 0.5);
      state.backgrounds = backgroundsAndLogos.map(({ backdrop }) => backdrop);
      state.shuffledBackgrounds = backgroundsAndLogosShuffled.map(({ backdrop }) => backdrop);
      state.logos = backgroundsAndLogosShuffled.map(({ logo }) => logo);
    });
  },
});

export const { chooseProfile, navigateTo, setCurrentMedia } = appSlice.actions;
export default appSlice.reducer;
