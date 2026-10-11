import { authApi } from '@features/auth/api/auth.api';
import type { PlayableRef } from '@miauflix/backend';
import type { HomeRegion, HomeView } from '@pages/home/homeNavigation';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { clearAuth, setSession } from '@store/slices/auth';

interface HomeNavigationState {
  view: HomeView;
  activeRegion: HomeRegion;
  activeCategory: number;
  selectedByCategory: Record<string, number>;
  pendingCategoryAdvance: boolean;
  playable: PlayableRef | null;
}

export const initialHomeNavigationState: HomeNavigationState = {
  view: 'browse',
  activeRegion: 'carousel',
  activeCategory: 0,
  selectedByCategory: {},
  pendingCategoryAdvance: false,
  playable: null,
};

export const homeNavigationSlice = createSlice({
  name: 'homeNavigation',
  initialState: initialHomeNavigationState,
  reducers: {
    setView(state, action: PayloadAction<HomeView>) {
      state.view = action.payload;
    },
    setActiveRegion(state, action: PayloadAction<HomeRegion>) {
      state.activeRegion = action.payload;
    },
    setActiveCategory(state, action: PayloadAction<number>) {
      state.activeCategory = Math.max(0, action.payload);
    },
    setCategorySelection(state, action: PayloadAction<{ slug: string; index: number }>) {
      state.selectedByCategory[action.payload.slug] = Math.max(0, action.payload.index);
    },
    setPendingCategoryAdvance(state, action: PayloadAction<boolean>) {
      state.pendingCategoryAdvance = action.payload;
    },
    setPlayable(state, action: PayloadAction<PlayableRef | null>) {
      state.playable = action.payload;
    },
    resetHomeNavigation() {
      return initialHomeNavigationState;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(clearAuth, () => initialHomeNavigationState)
      .addCase(setSession, () => initialHomeNavigationState)
      .addMatcher(authApi.endpoints.login.matchFulfilled, () => initialHomeNavigationState)
      .addMatcher(authApi.endpoints.claimQrLogin.matchFulfilled, (state, action) =>
        'session' in action.payload ? initialHomeNavigationState : state
      )
      .addMatcher(authApi.endpoints.logout.matchFulfilled, () => initialHomeNavigationState)
      .addMatcher(authApi.endpoints.logout.matchRejected, () => initialHomeNavigationState);
  },
});

export const homeNavigationActions = homeNavigationSlice.actions;

export const selectHomeNavigation = (state: { homeNavigation: HomeNavigationState }) =>
  state.homeNavigation;
