import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStableCallback } from './useStableCallback';

describe('useStableCallback', () => {
  it('keeps its identity and calls the latest callback', () => {
    const first = vi.fn((value: number) => value + 1);
    const second = vi.fn((value: number) => value + 2);
    const { result, rerender } = renderHook(
      ({ callback }: { callback: (value: number) => number }) => useStableCallback(callback),
      { initialProps: { callback: first } }
    );
    const stable = result.current;

    rerender({ callback: second });

    expect(result.current).toBe(stable);
    expect(stable(1)).toBe(3);
    expect(first).not.toHaveBeenCalled();
  });
});
