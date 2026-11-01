import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIdleRowWarmup } from './useIdleRowWarmup';

describe('useIdleRowWarmup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (enabled = true) =>
    renderHook(({ active }) => useIdleRowWarmup(enabled, active, 3), {
      initialProps: { active: 0 },
    });

  it('readies one more row each step once idle, up to the limit', () => {
    const { result } = setup();
    expect(result.current).toBe(-1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(500));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(4);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(4);
  });

  it('pauses while keys are pressed', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(900));
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    act(() => vi.advanceTimersByTime(900));
    expect(result.current).toBe(-1);
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(2);
  });

  it('keeps the readied rows when moving down, and goes on from there', () => {
    const { result, rerender } = setup();
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(500));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(4);
    rerender({ active: 2 });
    expect(result.current).toBe(4);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(5);
  });

  it('readies nothing while disabled', () => {
    const { result } = setup(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(-1);
  });
});
