import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

import { progressApi } from '../api/progress';
// Remove legacy progress DTO imports
// Use backend-client DTOs or 'any' as a fallback for MediaProgress
export type MediaProgress = any;

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
      for (const mediaProgress of action.payload.progress) {
        if (mediaProgress.type === 'movie') {
          state.movieProgress[mediaProgress.movieId] = mediaProgress.progress;
        } else {
          const showId = mediaProgress.showId;
          // Prefer season/episode, fallback to currentSeason/currentEpisode if present
          const season = mediaProgress.season ?? (mediaProgress as any).currentSeason;
          const episode =
            mediaProgress.episode ?? (mediaProgress as any).currentEpisode?.episodeNumber;
          if (!state.showProgress[showId]) {
            state.showProgress[showId] = {};
          }
          if (season !== undefined && episode !== undefined) {
            state.showProgress[showId][`${season}-${episode}`] = mediaProgress.progress;
          }
        }
      }
    });
  },
});

export const { setMediaProgress } = resumeSlice.actions;
export default resumeSlice.reducer;
