import { CategoryDto, MovieDto } from '@miauflix/types';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { categoriesApi } from '../api/categories';

export interface HomeState {
  category: CategoryDto;
  selectedMedia: MovieDto | null;
  selectedByCategory: Record<string, number>;
}

const initialState: HomeState = {
  category: {
    id: '',
    name: '',
  },
  selectedMedia: null,
  selectedByCategory: {},
};

export const homeSlice = createSlice({
  name: 'home',
  initialState,
  reducers: {
    changeCategory: (state, action: PayloadAction<CategoryDto>) => {
      state.category = action.payload;
      state.selectedByCategory[action.payload.id] = 0;
    },
    setSelectedIndexForCategory: (
      state,
      action: PayloadAction<{ category: string; index: number }>
    ) => {
      state.selectedByCategory[action.payload.category] = action.payload.index;
    },
    setSelectedMedia: (state, action: PayloadAction<MovieDto>) => {
      state.selectedMedia = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      categoriesApi.endpoints.getCategories.matchFulfilled,
      (state, action) => {
        if (state.category.id === '') {
          state.category = action.payload[0];
        }
      }
    );
  },
});

export const { changeCategory, setSelectedMedia, setSelectedIndexForCategory } =
  homeSlice.actions;
export default homeSlice.reducer;
