import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getTraktAssociation } = vi.hoisted(() => ({ getTraktAssociation: vi.fn() }));
vi.mock('@features/integrations/api/trakt.api', () => ({ getTraktAssociation }));
vi.mock('@features/progress/api/progress.api', () => ({
  progressApi: { util: { invalidateTags: () => ({ type: 'progress/invalidate' }) } },
}));

import { TRAKT_PROMPT_IDLE_MS, useTraktPrompt } from './useTraktPrompt';

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={configureStore({ reducer: { noop: (state = null) => state } })}>
    {children}
  </Provider>
);

const render = (props: { enabled: boolean; sessionId: string | null; userId?: string }) =>
  renderHook(p => useTraktPrompt({ userId: 'user-1', ...p }), { wrapper, initialProps: props });

/** Let the association lookup resolve. */
const settle = () => act(async () => await Promise.resolve());

describe('useTraktPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    getTraktAssociation.mockResolvedValue({ data: { connected: false } });
  });
  afterEach(() => vi.useRealTimers());

  it('opens after a quiet moment, and navigation keys postpone it', async () => {
    const { result } = render({ enabled: true, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS - 1_000));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS - 1_000));
    expect(result.current.open).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.open).toBe(true);
  });

  it.each([
    ['connected accounts', { data: { connected: true } }],
    ['a failed lookup', { error: 'unavailable' }],
  ])('never opens for %s', async (_name, association) => {
    getTraktAssociation.mockResolvedValue(association);
    const { result } = render({ enabled: true, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS * 2));
    expect(result.current.open).toBe(false);
  });

  it('stays closed while disabled and closes when disabled', async () => {
    const { result, rerender } = render({ enabled: false, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS * 2));
    expect(result.current.open).toBe(false);

    rerender({ enabled: true, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS));
    expect(result.current.open).toBe(true);
    rerender({ enabled: false, sessionId: 's1' });
    expect(result.current.open).toBe(false);
  });

  it('closing lasts for the session; a new session asks again', async () => {
    const { result, rerender } = render({ enabled: true, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS));
    act(() => result.current.dismiss(false));
    expect(result.current.open).toBe(false);

    rerender({ enabled: false, sessionId: 's1' });
    rerender({ enabled: true, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS * 2));
    expect(result.current.open).toBe(false);

    rerender({ enabled: true, sessionId: 's2' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS));
    expect(result.current.open).toBe(true);
  });

  it('remembers "don\'t ask again" for the user across sessions', async () => {
    const { result, rerender } = render({ enabled: true, sessionId: 's1' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS));
    act(() => result.current.dismiss(true));

    rerender({ enabled: true, sessionId: 's2' });
    await settle();
    act(() => vi.advanceTimersByTime(TRAKT_PROMPT_IDLE_MS * 2));
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem('miauflix:trakt:dont-ask:user-1')).toBe('1');
  });
});
