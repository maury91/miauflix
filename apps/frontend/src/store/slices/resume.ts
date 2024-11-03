import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { progressApi } from '../api/progress';

export interface ResumeState {
  mediaProgress: Record<string, number>;
}

const initialState: ResumeState = {
  mediaProgress: {},
};

export const resumeSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setMediaProgress: (
      state,
      action: PayloadAction<{ mediaId: string; progress: number }>
    ) => {
      state.mediaProgress[action.payload.mediaId] = action.payload.progress;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      progressApi.endpoints.getProgress.matchFulfilled,
      (state, action) => {
        for (const mediaProgress of action.payload) {
          state.mediaProgress[mediaProgress.movie.id] = mediaProgress.progress;
        }
      }
    );
  },
});

export const { setMediaProgress } = resumeSlice.actions;
export default resumeSlice.reducer;
