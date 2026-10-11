import { authApi } from '@features/auth/api/auth.api';
import { setupApi } from '@features/setup/api/setup.api';
import { createSlice } from '@reduxjs/toolkit';
import { clearAuth, setSession } from '@store/slices/auth';

type SettingsPage = 'settings' | 'configuration' | 'storage' | null;
type SettingsFocus = 'configuration' | 'storage';

interface AppStateSlice {
  setupAvailable: boolean | null; // null = not yet checked
  /** Admin chose "continue anyway" while required config is still missing */
  configDismissed: boolean;
  introPhase: 'pending' | 'centering' | 'playing' | 'complete';
  settingsPage: SettingsPage;
  settingsInitialFocus: SettingsFocus;
}

const initialState: AppStateSlice = {
  setupAvailable: null,
  configDismissed: false,
  introPhase: 'pending',
  settingsPage: null,
  settingsInitialFocus: 'configuration',
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
    openSettings(state) {
      state.settingsPage = 'settings';
      state.settingsInitialFocus = 'configuration';
    },
    openSettingsConfiguration(state) {
      state.settingsPage = 'configuration';
      state.settingsInitialFocus = 'configuration';
    },
    openSettingsStorage(state) {
      state.settingsPage = 'storage';
    },
    returnToSettings(state, action: { payload: SettingsFocus }) {
      state.settingsPage = 'settings';
      state.settingsInitialFocus = action.payload;
    },
    closeSettings(state) {
      state.settingsPage = null;
    },
    beginIntroCentering(state) {
      if (state.introPhase === 'pending') state.introPhase = 'centering';
    },
    beginIntroPlayback(state) {
      if (state.introPhase === 'centering') state.introPhase = 'playing';
    },
    completeIntro(state) {
      if (state.introPhase === 'playing') state.introPhase = 'complete';
    },
    cancelIntro(state) {
      if (state.introPhase === 'centering' || state.introPhase === 'playing') {
        state.introPhase = 'pending';
      }
    },
  },
  extraReducers: builder => {
    builder.addCase(clearAuth, state => {
      state.settingsPage = null;
    });
    builder.addCase(setSession, state => {
      state.settingsPage = null;
    });
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
    builder
      .addMatcher(authApi.endpoints.logout.matchFulfilled, state => {
        state.settingsPage = null;
      })
      .addMatcher(authApi.endpoints.logout.matchRejected, state => {
        state.settingsPage = null;
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
  beginIntroCentering,
  beginIntroPlayback,
  cancelIntro,
  completeIntro,
  dismissConfigWizard,
  openSettings,
  openSettingsConfiguration,
  openSettingsStorage,
  returnToSettings,
  closeSettings,
  resetConfigDismissed,
} = appStateSlice.actions;

export const selectSetupAvailable = (state: { appState: AppStateSlice }) =>
  state.appState.setupAvailable;

export const selectConfigDismissed = (state: { appState: AppStateSlice }) =>
  state.appState.configDismissed;

export const selectIntroPhase = (state: { appState: AppStateSlice }) => state.appState.introPhase;
export const selectSettingsPage = (state: { appState: AppStateSlice }) =>
  state.appState.settingsPage;
export const selectSettingsInitialFocus = (state: { appState: AppStateSlice }) =>
  state.appState.settingsInitialFocus;
