import { setupApi } from '@features/setup/api/setup.api';
import { createSlice } from '@reduxjs/toolkit';

interface AppStateSlice {
  setupAvailable: boolean | null; // null = not yet checked
  /** Admin chose "continue anyway" while required config is still missing */
  configDismissed: boolean;
}

const initialState: AppStateSlice = {
  setupAvailable: null,
  configDismissed: false,
};

export const appStateSlice = createSlice({
  name: 'appState',
  initialState,
  reducers: {
    dismissConfigWizard(state) {
      state.configDismissed = true;
    },
    resetConfigDismissed(state) {
      state.configDismissed = false;
    },
  },
  extraReducers: builder => {
    builder.addMatcher(setupApi.endpoints.checkSetupStatus.matchFulfilled, (state, action) => {
      state.setupAvailable = action.payload.available;
    });
    // Fail-safe: if the endpoint fails (e.g. not deployed), don't block the app
    builder.addMatcher(setupApi.endpoints.checkSetupStatus.matchRejected, state => {
      state.setupAvailable = false;
    });
    // After creating admin, setup is no longer available
    builder.addMatcher(setupApi.endpoints.createAdmin.matchFulfilled, state => {
      state.setupAvailable = false;
    });
  },
});

export const { dismissConfigWizard, resetConfigDismissed } = appStateSlice.actions;

export const selectSetupAvailable = (state: { appState: AppStateSlice }) =>
  state.appState.setupAvailable;

export const selectConfigDismissed = (state: { appState: AppStateSlice }) =>
  state.appState.configDismissed;
