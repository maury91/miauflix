import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRestedRow } from './useRestedRow';

describe('useRestedRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (enabled = true) =>
    renderHook(({ active }) => useRestedRow(active, enabled), { initialProps: { active: 3 } });

  it('follows the focused row once the slide ends, not on each move', () => {
    const { result, rerender } = setup();
    rerender({ active: 4 });
    rerender({ active: 5 });
    expect(result.current.restedRow).toBe(3);
    act(() => result.current.rested());
    expect(result.current.restedRow).toBe(5);
  });

  it('catches up after a second when nothing slides', () => {
    const { result, rerender } = setup();
    rerender({ active: 4 });
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.restedRow).toBe(3);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.restedRow).toBe(4);
  });

  it('is the focused row itself while disabled', () => {
    const { result, rerender } = setup(false);
    rerender({ active: 4 });
    expect(result.current.restedRow).toBe(4);
  });
});
