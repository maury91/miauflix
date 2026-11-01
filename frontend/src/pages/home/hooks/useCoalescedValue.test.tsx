import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCoalescedValue } from './useCoalescedValue';

describe('useCoalescedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (delayMs = 150) =>
    renderHook(({ value }) => useCoalescedValue(value, delayMs), { initialProps: { value: 0 } });

  it('applies a change after a pause at once', () => {
    const { result, rerender } = setup();
    rerender({ value: 1 });
    expect(result.current).toBe(1);
  });

  it('holds quick successive changes until they pause, then applies the latest', () => {
    const { result, rerender } = setup();
    rerender({ value: 1 });
    act(() => vi.advanceTimersByTime(50));
    rerender({ value: 2 });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 3 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(1);

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe(3);
  });

  it('applies every value at once without a delay', () => {
    const { result, rerender } = setup(0);
    rerender({ value: 1 });
    rerender({ value: 2 });
    expect(result.current).toBe(2);
  });
});
