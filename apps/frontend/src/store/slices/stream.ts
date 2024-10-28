import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface StreamState {
  url: string;
}

const initialState: StreamState = {
  url: '',
};

export const streamSlice = createSlice({
  name: 'stream',
  initialState,
  reducers: {
    setStreamUrl: (state, action: PayloadAction<string>) => {
      state.url = action.payload;
    },
  },
});

export const { setStreamUrl } = streamSlice.actions;
export default streamSlice.reducer;
