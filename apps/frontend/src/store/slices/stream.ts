import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface StreamState {
  url: string;
  id: string;
  streamId: string;
  season: number;
  episode: number;
  type: 'movie' | 'episode';
}

const initialState: StreamState = {
  url: '',
  id: '',
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
            id: string;
            streamId: string;
            type: 'movie';
          }
        | {
            url: string;
            id: string;
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
      } else {
        state.season = 0;
        state.episode = 0;
      }
    },
  },
});

export const { setStreamUrl } = streamSlice.actions;
export default streamSlice.reducer;
