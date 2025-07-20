import type { MovieResponse, ListDto, ShowResponse } from '@miauflix/backend-client';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listsApi } from '../api/lists';

export interface HomeState {
  category: { id: string; name: string; slug: string; description: string; url: string };
  selectedMedia: MovieResponse | ShowResponse | null;
  selectedByCategory: Record<string, number>;
}

const initialState: HomeState = {
  category: {
    id: '',
    name: '',
    slug: '',
    description: '',
    url: '',
  },
  selectedMedia: null,
  selectedByCategory: {},
};

export const homeSlice = createSlice({
  name: 'home',
  initialState,
  reducers: {
    changeCategory: (state, action: PayloadAction<ListDto>) => {
      state.category = { ...action.payload, id: action.payload.slug };
      state.selectedByCategory[action.payload.slug] = 0;
    },
    setSelectedIndexForCategory: (
      state,
      action: PayloadAction<{ category: string; index: number }>
    ) => {
      state.selectedByCategory[action.payload.category] = action.payload.index;
    },
    setSelectedMedia: (state, action: PayloadAction<MovieResponse | ShowResponse>) => {
      state.selectedMedia = action.payload;
    },
  },
  extraReducers: builder => {
    builder.addMatcher(listsApi.endpoints.getLists.matchFulfilled, (state, action) => {
      if (state.category.slug === '') {
        state.category = { ...action.payload[0], id: action.payload[0].slug };
      }
    });
  },
});

export const { changeCategory, setSelectedMedia, setSelectedIndexForCategory } = homeSlice.actions;
export default homeSlice.reducer;
