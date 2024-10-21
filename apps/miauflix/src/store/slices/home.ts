import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listsApi } from '../api/movies';
import { categoriesApi, Category } from '../api/categories';

export interface HomeState {
  category: Category;
  selected: number;
  selectedByCategory: Record<string, number>;
  countsByCategory: Record<string, number>;
}

const initialState: HomeState = {
  category: {
    id: '',
    name: '',
  },
  selected: 0,
  selectedByCategory: {},
  countsByCategory: {},
};

export const homeSlice = createSlice({
  name: 'home',
  initialState,
  reducers: {
    changeCategory: (state, action: PayloadAction<Category>) => {
      state.category = action.payload;
      state.selectedByCategory[action.payload.id] = 0;
    },
    previous: (state) => {
      state.selectedByCategory[state.category.id] = Math.max(
        0,
        state.selectedByCategory[state.category.id] - 1
      );
      state.selected = state.selectedByCategory[state.category.id];
    },
    next: (state) => {
      const max = state.countsByCategory[state.category.id] ?? 0;
      state.selectedByCategory[state.category.id] = Math.min(
        state.selectedByCategory[state.category.id] + 1,
        max
      );
      state.selected = state.selectedByCategory[state.category.id];
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      listsApi.endpoints.getList.matchFulfilled,
      (state, action) => {
        state.countsByCategory[action.meta.arg.originalArgs] =
          action.payload.length;
      }
    );
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

export const { changeCategory, previous, next } = homeSlice.actions;
export default homeSlice.reducer;
