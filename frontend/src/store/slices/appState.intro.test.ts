import { describe, expect, it } from 'vitest';

import { appStateSlice, beginIntroPlayback, completeIntro, setIntroEligible } from './appState';
import { clearAuth } from './auth';

describe('intro state transitions', () => {
  it('only advances through centering and playback in order', () => {
    let state = appStateSlice.reducer(undefined, { type: '@@test/init' });
    state = appStateSlice.reducer(state, beginIntroPlayback());
    expect(state.introPhase).toBe('pending');

    state = appStateSlice.reducer(state, setIntroEligible(true));
    expect(state.introPhase).toBe('centering');

    state = appStateSlice.reducer(state, completeIntro());
    expect(state.introPhase).toBe('centering');

    state = appStateSlice.reducer(state, beginIntroPlayback());
    expect(state.introPhase).toBe('playing');
    state = appStateSlice.reducer(state, completeIntro());
    expect(state.introPhase).toBe('complete');
  });

  it('cancels interrupted transitions and can start again when Home becomes eligible', () => {
    let state = appStateSlice.reducer(undefined, setIntroEligible(true));
    state = appStateSlice.reducer(state, beginIntroPlayback());
    state = appStateSlice.reducer(state, setIntroEligible(false));
    expect(state.introPhase).toBe('pending');

    state = appStateSlice.reducer(state, setIntroEligible(true));
    expect(state.introPhase).toBe('centering');
  });

  it('does not replay after completion', () => {
    let state = appStateSlice.reducer(undefined, setIntroEligible(true));
    state = appStateSlice.reducer(state, beginIntroPlayback());
    state = appStateSlice.reducer(state, completeIntro());
    state = appStateSlice.reducer(state, setIntroEligible(false));
    state = appStateSlice.reducer(state, setIntroEligible(true));
    expect(state.introPhase).toBe('complete');
  });

  it('keeps a completed intro complete when authentication clears', () => {
    let state = appStateSlice.reducer(undefined, setIntroEligible(true));
    state = appStateSlice.reducer(state, beginIntroPlayback());
    state = appStateSlice.reducer(state, completeIntro());
    state = appStateSlice.reducer(state, clearAuth());
    expect(state.introPhase).toBe('complete');
  });
});
