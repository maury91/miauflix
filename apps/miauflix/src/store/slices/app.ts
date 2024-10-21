import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listsApi } from '../api/movies';
import { Page } from '../../types';

export interface AppState {
  currentPage: Page;
  currentProfile: string | null;
  backgrounds: string[];
  shuffledBackgrounds: string[];
  logos: string[];
}

const initialState: AppState = {
  currentPage: 'profile-selection',
  currentProfile: null,
  backgrounds: [],
  shuffledBackgrounds: [],
  logos: [],
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    chooseProfile: (state, action: PayloadAction<string>) => {
      state.currentPage = 'home';
      state.currentProfile = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      listsApi.endpoints.getList.matchFulfilled,
      (state, action) => {
        const backgroundsAndLogos = action.payload.map((movie) => ({
          backdrop: movie.images.backdrops.length
            ? movie.images.backdrops[0]
            : movie.images.backdrop,
          logo: movie.images.logos[0],
        }));
        const backgroundsAndLogosShuffled = [...backgroundsAndLogos].sort(
          () => Math.random() - 0.5
        );
        state.backgrounds = backgroundsAndLogos.map(({ backdrop }) => backdrop);
        state.shuffledBackgrounds = backgroundsAndLogosShuffled.map(
          ({ backdrop }) => backdrop
        );
        state.logos = backgroundsAndLogosShuffled.map(({ logo }) => logo);
      }
    );
  },
});

export const { chooseProfile } = appSlice.actions;
export default appSlice.reducer;
