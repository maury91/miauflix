import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { moviesApi } from '../api/movies';

export interface AppState {
  currentPage: 'profile-selection' | 'home';
  currentProfile: string | null;
  backgrounds: string[];
}

const initialState: AppState = {
  currentPage: 'profile-selection',
  currentProfile: null,
  backgrounds: [],
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
      moviesApi.endpoints.getTrendingMovies.matchFulfilled,
      (state, action) => {
        state.backgrounds = action.payload
          .map((movie) => movie.fanart.backdrop)
          .filter((backdrop) => backdrop)
          .sort(() => Math.random() - 0.5);
      }
    );
  },
});

export const { chooseProfile } = appSlice.actions;
export default appSlice.reducer;
