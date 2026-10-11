import { describe, expect, it } from 'vitest';

import {
  appStateSlice,
  beginIntroCentering,
  beginIntroPlayback,
  cancelIntro,
  completeIntro,
} from './appState';
import { clearAuth } from './auth';

describe('intro state transitions', () => {
  it('only advances through centering and playback in order', () => {
    let state = appStateSlice.reducer(undefined, { type: '@@test/init' });
    state = appStateSlice.reducer(state, beginIntroPlayback());
    expect(state.introPhase).toBe('pending');

    state = appStateSlice.reducer(state, beginIntroCentering());
    expect(state.introPhase).toBe('centering');

    state = appStateSlice.reducer(state, completeIntro());
    expect(state.introPhase).toBe('centering');

    state = appStateSlice.reducer(state, beginIntroPlayback());
    expect(state.introPhase).toBe('playing');
    state = appStateSlice.reducer(state, completeIntro());
    expect(state.introPhase).toBe('complete');
  });

  it('cancels interrupted transitions and can start again when Home becomes eligible', () => {
    let state = appStateSlice.reducer(undefined, beginIntroCentering());
    state = appStateSlice.reducer(state, beginIntroPlayback());
    state = appStateSlice.reducer(state, cancelIntro());
    expect(state.introPhase).toBe('pending');

    state = appStateSlice.reducer(state, beginIntroCentering());
    expect(state.introPhase).toBe('centering');
  });

  it('does not replay after completion', () => {
    let state = appStateSlice.reducer(undefined, beginIntroCentering());
    state = appStateSlice.reducer(state, beginIntroPlayback());
    state = appStateSlice.reducer(state, completeIntro());
    state = appStateSlice.reducer(state, cancelIntro());
    state = appStateSlice.reducer(state, beginIntroCentering());
    expect(state.introPhase).toBe('complete');
  });

  it('keeps settings navigation in app state and clears it on logout without replaying intro', () => {
    let state = appStateSlice.reducer(undefined, beginIntroCentering());
    state = appStateSlice.reducer(state, beginIntroPlayback());
    state = appStateSlice.reducer(state, completeIntro());
    state = appStateSlice.reducer(state, { type: 'appState/openSettings' });
    state = appStateSlice.reducer(state, { type: 'appState/openSettingsStorage' });
    expect(state.settingsPage).toBe('storage');

    state = appStateSlice.reducer(state, clearAuth());
    expect(state.settingsPage).toBeNull();
    expect(state.introPhase).toBe('complete');
  });
});
