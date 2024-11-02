import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface StreamState {
  url: string;
  id: string;
  type: 'movie' | 'tv';
}

const initialState: StreamState = {
  url: '',
  id: '',
  type: 'movie',
};

export const streamSlice = createSlice({
  name: 'stream',
  initialState,
  reducers: {
    setStreamUrl: (
      state,
      action: PayloadAction<{
        url: string;
        id: string;
        type: StreamState['type'];
      }>
    ) => {
      state.url = action.payload.url;
      state.id = action.payload.id;
      state.type = action.payload.type;
    },
  },
});

export const { setStreamUrl } = streamSlice.actions;
export default streamSlice.reducer;
