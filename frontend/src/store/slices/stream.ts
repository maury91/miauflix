import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { StreamResponse, StreamSourceDto } from '@miauflix/backend-client';

export interface StreamState {
  url: string;
  source: StreamSourceDto | null;
  status: string;
  id: number;
  streamId: string;
  showSlug?: string;
  season?: number;
  episode?: number;
  type: 'movie' | 'episode';
}

const initialState: StreamState = {
  url: '',
  source: null,
  status: '',
  id: 0,
  streamId: '',
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
            response: StreamResponse;
            id: number;
            streamId: string;
            type: 'movie' | 'episode';
            showSlug?: string;
            season?: number;
            episode?: number;
          }
        | {
            url: string;
            id: number;
            type: 'movie' | 'episode';
            showSlug?: string;
            season?: number;
            episode?: number;
          }
      >
    ) => {
      state.url = action.payload.url;
      state.id = action.payload.id;
      state.type = action.payload.type;

      // Handle full StreamResponse format
      if ('response' in action.payload) {
        state.source = action.payload.response.source;
        state.status = action.payload.response.status;
        state.streamId = action.payload.streamId;
      } else {
        // Handle simplified format for episodes
        state.source = null;
        state.status = 'streaming';
        state.streamId = action.payload.url; // Use URL as streamId for episodes
      }

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
