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
    setMediaProgress: (state, action: PayloadAction<{ mediaId: number; progress: number }>) => {
      state.movieProgress[action.payload.mediaId] = action.payload.progress;
      // ToDo: Episode progress
    },
  },
  extraReducers: builder => {
    builder.addMatcher(progressApi.endpoints.getProgress.matchFulfilled, (state, action) => {
      for (const mediaProgress of action.payload) {
        if (mediaProgress.type === 'movie') {
          state.movieProgress[mediaProgress.movie.id] = mediaProgress.progress;
        } else {
          if (!state.showProgress[mediaProgress.show.id]) {
            state.showProgress[mediaProgress.show.id] = {};
          }
          state.showProgress[mediaProgress.show.id][
            `${mediaProgress.season}-${mediaProgress.episode}`
          ] = mediaProgress.progress;
        }
      }
    });
  },
});

export const { setMediaProgress } = resumeSlice.actions;
export default resumeSlice.reducer;
