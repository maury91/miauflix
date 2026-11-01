import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRestingValue } from './useRestingValue';

describe('useRestingValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (delayMs: number, initial = { value: 'a', key: 'a' }) =>
    renderHook(({ value, key }) => useRestingValue(value, key, delayMs), {
      initialProps: initial,
    });

  it('keeps the previous value until the new one has rested', () => {
    const { result, rerender } = setup(250);
    expect(result.current).toBe('a');

    rerender({ value: 'b', key: 'b' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'c', key: 'c' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe('c');
  });

  it('applies a value at once after an empty key, and when there is no delay', () => {
    const fromEmpty = setup(250, { value: '', key: '' });
    fromEmpty.rerender({ value: 'b', key: 'b' });
    expect(fromEmpty.result.current).toBe('b');

    const noDelay = setup(0);
    noDelay.rerender({ value: 'b', key: 'b' });
    expect(noDelay.result.current).toBe('b');
  });

  it('passes through changes that keep the key', () => {
    const { result, rerender } = setup(250, { value: 'a1', key: 'a' });
    rerender({ value: 'a2', key: 'a' });
    expect(result.current).toBe('a2');
  });
});
