import type { AppState } from '@app/hooks/useAppState';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/config/constants', () => ({ builtForTizen: true }));

import { useKeyboardClosedAppState } from './useKeyboardClosedAppState';

const resize = (height: number) =>
  act(() => {
    vi.stubGlobal('innerHeight', height);
    window.dispatchEvent(new Event('resize'));
  });

const setup = () => {
  const field = document.createElement('input');
  document.body.appendChild(field);
  field.focus();
  const hook = renderHook(({ state }: { state: AppState }) => useKeyboardClosedAppState(state), {
    initialProps: { state: 'login' },
  });
  return { field, ...hook };
};

describe('useKeyboardClosedAppState on the TV', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('screen', { height: 1080 });
    vi.stubGlobal('innerHeight', 1080);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('stays on login until the keyboard has closed, closing it', async () => {
    const { field, result, rerender } = setup();
    await resize(540);

    rerender({ state: 'home' });
    expect(result.current).toBe('login');
    expect(document.activeElement).not.toBe(field);

    await resize(1080);
    expect(result.current).toBe('home');
  });

  it('leaves login at once without the keyboard', () => {
    const { result, rerender } = setup();
    rerender({ state: 'home' });
    expect(result.current).toBe('home');
  });

  it('leaves login anyway when the keyboard does not close', async () => {
    const { result, rerender } = setup();
    await resize(540);
    rerender({ state: 'home' });
    expect(result.current).toBe('login');

    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(result.current).toBe('home');
  });

  it('never holds a page other than login', async () => {
    const { result, rerender } = setup();
    rerender({ state: 'home' });
    await resize(540);
    rerender({ state: 'config' });
    expect(result.current).toBe('config');
  });
});
