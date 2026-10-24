import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isHomeReady, useIntroReadiness } from './useIntroReadiness';

describe('isHomeReady', () => {
  const ready = {
    failed: false,
    listsReady: true,
    progressReady: true,
    rowSlugs: ['a', 'b'],
    readyRowSlugs: { a: true, b: true } as Record<string, true>,
    selectedMediaId: 7,
    heroMediaId: 7 as number | null | undefined,
  };

  it.each<[string, Partial<typeof ready>, boolean]>([
    ['everything loaded', {}, true],
    ['lists still loading', { listsReady: false }, false],
    ['progress still loading', { progressReady: false }, false],
    ['a loading row has not reported', { readyRowSlugs: { a: true } }, false],
    ['the hero shows another title', { heroMediaId: 8 }, false],
    ['the hero has not shown anything', { heroMediaId: undefined }, false],
    ['an empty hero for no selection', { selectedMediaId: null, heroMediaId: null }, true],
    ['a failed list load reveals the error', { failed: true, listsReady: false }, true],
  ])('%s → %s', (_name, overrides, expected) => {
    expect(isHomeReady({ ...ready, ...overrides })).toBe(expected);
  });
});

describe('useIntroReadiness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback =>
      window.setTimeout(() => callback(performance.now()), 16)
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const props = {
    sessionId: 's1' as string | null,
    rowLoadState: { visible: new Set([0, 1]), prefetch: new Set([2]) },
    categorySlugs: ['a', 'b', 'c'],
    failed: false,
    listsReady: true,
    progressReady: true,
    selectedMediaId: 7 as number | null,
  };

  it('notifies once, two frames after every loading row and the hero are ready', () => {
    const onHydrated = vi.fn();
    const { result, rerender } = renderHook(p => useIntroReadiness(p), {
      initialProps: { ...props, onHydrated },
    });
    act(() => {
      result.current.onRowDataReady('a');
      result.current.onRowDataReady('b');
      result.current.onHeroReady(7);
    });
    act(() => vi.advanceTimersByTime(100));
    expect(onHydrated).not.toHaveBeenCalled();

    act(() => result.current.onRowDataReady('c'));
    act(() => vi.advanceTimersByTime(16));
    expect(onHydrated).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(16));
    expect(onHydrated).toHaveBeenCalledTimes(1);

    rerender({ ...props, onHydrated, selectedMediaId: 8 });
    act(() => result.current.onHeroReady(8));
    act(() => vi.advanceTimersByTime(100));
    expect(onHydrated).toHaveBeenCalledTimes(1);
  });

  it('forgets row and hero readiness when the session changes', () => {
    const onHydrated = vi.fn();
    const { result, rerender } = renderHook(p => useIntroReadiness(p), {
      initialProps: { ...props, onHydrated, sessionId: null as string | null },
    });
    act(() => {
      result.current.onRowDataReady('a');
      result.current.onRowDataReady('b');
      result.current.onRowDataReady('c');
    });
    rerender({ ...props, onHydrated, sessionId: 's2' });
    act(() => result.current.onHeroReady(7));
    act(() => vi.advanceTimersByTime(100));
    expect(onHydrated).not.toHaveBeenCalled();
  });
});
