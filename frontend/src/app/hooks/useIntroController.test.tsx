import { configureStore } from '@reduxjs/toolkit';
import { appStateSlice } from '@store/slices/appState';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppState } from './useAppState';
import { useIntroController } from './useIntroController';

const setupTest = () => {
  const store = configureStore({ reducer: { appState: appStateSlice.reducer } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    ({ page, eligible }: { page: AppState; eligible: boolean }) =>
      useIntroController(page, eligible),
    { wrapper, initialProps: { page: 'home' as AppState, eligible: true } }
  );
  return { store, ...hook };
};

describe('intro controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window._miauflixAnimationComplete;
  });

  it('waits for hydration and animation readiness, starts, and completes only once', () => {
    const { result, store, rerender } = setupTest();
    const start = vi.fn();
    result.current.logoRef.current = { start };
    act(() => result.current.handleHomeHydrated());
    act(() => vi.runAllTimers());
    expect(store.getState().appState.introPhase).toBe('centering');
    act(() => result.current.handleIntroReady());
    act(() => vi.runAllTimers());
    // Ready: the loading pulse stops; playback waits until the logo is back at full size.
    expect(result.current.introReady).toBe(true);
    expect(store.getState().appState.introPhase).toBe('centering');
    act(() => result.current.handleLogoSettled());
    act(() => vi.runAllTimers());
    expect(start).toHaveBeenCalledOnce();
    expect(store.getState().appState.introPhase).toBe('playing');
    const completed = vi.fn();
    window.addEventListener('miauflix:intro:animation:complete', completed);
    try {
      act(() => {
        result.current.handleIntroComplete();
        result.current.handleIntroComplete();
      });
      expect(completed).toHaveBeenCalledOnce();
      expect(window._miauflixAnimationComplete).toBe(true);
      rerender({ page: 'login', eligible: false });
      rerender({ page: 'home', eligible: true });
      expect(store.getState().appState.introPhase).toBe('complete');
    } finally {
      window.removeEventListener('miauflix:intro:animation:complete', completed);
    }
  });

  it('cancels queued playback and ignores stale animation callbacks when Home becomes ineligible', () => {
    const { result, store, rerender } = setupTest();
    act(() => {
      result.current.handleHomeHydrated();
      result.current.handleIntroReady();
    });
    rerender({ page: 'login', eligible: false });
    act(() => {
      vi.runAllTimers();
      result.current.handleIntroComplete();
      result.current.handleIntroStart();
    });
    expect(store.getState().appState.introPhase).toBe('pending');
    expect(result.current.introHasStarted).toBe(false);
    expect(window._miauflixAnimationComplete).toBeUndefined();
    rerender({ page: 'home', eligible: true });
    act(() => {
      result.current.handleHomeHydrated();
      result.current.handleIntroReady();
      vi.runAllTimers();
    });
    expect(store.getState().appState.introPhase).toBe('centering');
    act(() => result.current.handleLogoCentered());
    act(() => result.current.handleLogoSettled());
    act(() => vi.runAllTimers());
    expect(store.getState().appState.introPhase).toBe('playing');
  });

  it('ignores a settled logo reported before the intro is ready', () => {
    const { result, store } = setupTest();
    act(() => result.current.handleLogoSettled());
    act(() => result.current.handleHomeHydrated());
    act(() => result.current.handleIntroReady());
    act(() => vi.runAllTimers());
    expect(store.getState().appState.introPhase).toBe('centering');
    act(() => result.current.handleLogoSettled());
    act(() => vi.runAllTimers());
    expect(store.getState().appState.introPhase).toBe('playing');
  });

  it('cancels native idle scheduling on unmount', () => {
    const requestIdle = vi.fn(() => 42);
    const cancelIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);
    const { result, unmount } = setupTest();
    act(() => {
      result.current.handleHomeHydrated();
      result.current.handleIntroReady();
    });
    act(() => result.current.handleLogoSettled());
    expect(requestIdle).toHaveBeenCalledOnce();
    unmount();
    expect(cancelIdle).toHaveBeenCalledWith(42);
  });
});
