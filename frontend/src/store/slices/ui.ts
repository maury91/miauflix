import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export interface UIState {
  highlightedCategory: number;
  highlightedMediaByCategory: Record<number, number>;
}

const initialState: UIState = {
  highlightedCategory: 0,
  highlightedMediaByCategory: {},
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    highlightCategory: (state, action: PayloadAction<number>) => {
      state.highlightedCategory = action.payload;
    },
    highlightMedia: (state, action: PayloadAction<{ categoryId: number; mediaId: number }>) => {
      state.highlightedMediaByCategory[action.payload.categoryId] = action.payload.mediaId;
    },
  },
});

export const { highlightCategory, highlightMedia } = uiSlice.actions;
export default uiSlice.reducer;
