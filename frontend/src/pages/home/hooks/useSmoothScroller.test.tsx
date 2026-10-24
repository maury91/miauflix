import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSmoothScroller, scrollTo, dispose } = vi.hoisted(() => ({
  createSmoothScroller: vi.fn(),
  scrollTo: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../smooth-scroll', () => ({
  createSmoothScroller,
}));

import { useSmoothScroller } from './useSmoothScroller';

describe('useSmoothScroller', () => {
  beforeEach(() => {
    scrollTo.mockReset();
    dispose.mockReset();
    createSmoothScroller.mockReset().mockReturnValue({ scrollTo, dispose });
  });

  it('jumps the first scroll after every attachment, then preserves options', () => {
    const { result } = renderHook(() => useSmoothScroller('x'));
    const first = document.createElement('div');
    const second = document.createElement('div');

    result.current.scrollTo(10);
    expect(scrollTo).not.toHaveBeenCalled();

    result.current.ref(first);
    result.current.scrollTo(20);
    result.current.scrollTo(30, { instant: false });
    expect(scrollTo).toHaveBeenNthCalledWith(1, 20, { instant: true });
    expect(scrollTo).toHaveBeenNthCalledWith(2, 30, { instant: false });

    result.current.ref(second);
    result.current.scrollTo(40, { instant: false });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith(40, { instant: true });
  });
});
