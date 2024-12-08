import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { progressApi } from '../api/progress';

export interface ResumeState {
  movieProgress: Record<string, number>;
  showProgress: Record<string, Record<string, number>>;
}

const initialState: ResumeState = {
  movieProgress: {},
  showProgress: {},
};

export const resumeSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setMediaProgress: (
      state,
      action: PayloadAction<{ mediaId: string; progress: number }>
    ) => {
      state.movieProgress[action.payload.mediaId] = action.payload.progress;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      progressApi.endpoints.getMoviesProgress.matchFulfilled,
      (state, action) => {
        for (const movieProgress of action.payload) {
          state.movieProgress[movieProgress.movie.id] = movieProgress.progress;
        }
      }
    );
    builder.addMatcher(
      progressApi.endpoints.getEpisodesProgress.matchFulfilled,
      (state, action) => {
        for (const movieProgress of action.payload) {
          if (!state.showProgress[movieProgress.show.id]) {
            state.showProgress[movieProgress.show.id] = {};
          }
          state.showProgress[movieProgress.show.id][
            `${movieProgress.season}-${movieProgress.episode}`
          ] = movieProgress.progress;
        }
      }
    );
  },
});

export const { setMediaProgress } = resumeSlice.actions;
export default resumeSlice.reducer;
