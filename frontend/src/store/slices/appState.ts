import { authApi } from '@features/auth/api/auth.api';
import { setupApi } from '@features/setup/api/setup.api';
import { createSlice } from '@reduxjs/toolkit';

interface AppStateSlice {
  setupAvailable: boolean | null; // null = not yet checked
  /** Admin chose "continue anyway" while required config is still missing */
  configDismissed: boolean;
  introPhase: 'pending' | 'centering' | 'playing' | 'complete';
}

const initialState: AppStateSlice = {
  setupAvailable: null,
  configDismissed: false,
  introPhase: 'pending',
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
    setIntroEligible(state, action: { payload: boolean }) {
      if (action.payload && state.introPhase === 'pending') state.introPhase = 'centering';
      if (!action.payload && (state.introPhase === 'centering' || state.introPhase === 'playing')) {
        state.introPhase = 'pending';
      }
    },
    beginIntroPlayback(state) {
      if (state.introPhase === 'centering') state.introPhase = 'playing';
    },
    completeIntro(state) {
      if (state.introPhase === 'playing') state.introPhase = 'complete';
    },
  },
  extraReducers: builder => {
    // A "Go to Home" choice only applies to the current session. Check the
    // configuration again after the next successful login.
    builder.addMatcher(authApi.endpoints.login.matchFulfilled, state => {
      state.configDismissed = false;
    });
    builder.addMatcher(authApi.endpoints.claimQrLogin.matchFulfilled, (state, action) => {
      if ('session' in action.payload) {
        state.configDismissed = false;
      }
    });
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

export const {
  beginIntroPlayback,
  completeIntro,
  dismissConfigWizard,
  resetConfigDismissed,
  setIntroEligible,
} = appStateSlice.actions;

export const selectSetupAvailable = (state: { appState: AppStateSlice }) =>
  state.appState.setupAvailable;

export const selectConfigDismissed = (state: { appState: AppStateSlice }) =>
  state.appState.configDismissed;

export const selectIntroPhase = (state: { appState: AppStateSlice }) => state.appState.introPhase;
