import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { listsApi } from '../api/lists';
import { Page } from '../../types';

export interface ProfileSelectionState {
  screen: 'profile-selection' | 'new-profile' | 'settings';
}

const initialState: ProfileSelectionState = {
  screen: 'profile-selection',
};

export const profileSelectionSlice = createSlice({
  name: 'profileSelection',
  initialState,
  reducers: {
    navigateToNewProfile: (state) => {
      state.screen = 'new-profile';
    },
    navigateToSettings: (state) => {
      state.screen = 'settings';
    },
    navigateToProfileSelection: (state) => {
      state.screen = 'profile-selection';
    },
  },
});

export const {
  navigateToNewProfile,
  navigateToProfileSelection,
  navigateToSettings,
} = profileSelectionSlice.actions;
export default profileSelectionSlice.reducer;
