import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface StreamState {
  url: string;
  id: number;
  streamId: string;
  showSlug: string;
  season: number;
  episode: number;
  type: 'movie' | 'episode';
}

const initialState: StreamState = {
  url: '',
  id: 0,
  showSlug: '',
  streamId: '',
  season: 0,
  episode: 0,
  type: 'movie',
};

export const streamSlice = createSlice({
  name: 'stream',
  initialState,
  reducers: {
    setStreamUrl: (
      state,
      action: PayloadAction<
        | {
            url: string;
            id: number;
            streamId: string;
            type: 'movie';
          }
        | {
            url: string;
            id: number;
            showSlug: string;
            streamId: string;
            season: number;
            episode: number;
            type: 'episode';
          }
      >
    ) => {
      state.url = action.payload.url;
      state.id = action.payload.id;
      state.streamId = action.payload.streamId;
      state.type = action.payload.type;
      if (action.payload.type === 'episode') {
        state.season = action.payload.season;
        state.episode = action.payload.episode;
        state.showSlug = action.payload.showSlug;
      } else {
        state.season = 0;
        state.episode = 0;
        state.showSlug = '';
      }
    },
  },
});

export const { setStreamUrl } = streamSlice.actions;
export default streamSlice.reducer;
