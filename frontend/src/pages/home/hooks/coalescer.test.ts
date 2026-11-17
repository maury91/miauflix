import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCoalescer } from './coalescer';

describe('createCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies a change after a pause on the next task', () => {
    const apply = vi.fn();
    const coalescer = createCoalescer<number>(150, apply);
    coalescer.push(1);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(apply.mock.calls).toEqual([[1]]);
  });

  it('holds quick successive changes until they pause, then applies the latest', () => {
    const apply = vi.fn();
    const coalescer = createCoalescer<number>(150, apply);
    coalescer.push(1);
    vi.advanceTimersByTime(50);
    coalescer.push(2);
    vi.advanceTimersByTime(100);
    coalescer.push(3);
    vi.advanceTimersByTime(100);
    expect(apply.mock.calls).toEqual([[1]]);

    vi.advanceTimersByTime(50);
    expect(apply.mock.calls).toEqual([[1], [3]]);
  });

  it('applies a pending value at once on flush, and nothing on cancel', () => {
    const apply = vi.fn();
    const coalescer = createCoalescer<number>(150, apply);
    coalescer.push(1);
    coalescer.flush();
    expect(apply.mock.calls).toEqual([[1]]);
    coalescer.flush();
    expect(apply).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10);
    coalescer.push(2);
    coalescer.cancel();
    vi.advanceTimersByTime(500);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('applies every value at once, synchronously, without a delay', () => {
    const apply = vi.fn();
    const coalescer = createCoalescer<number>(0, apply);
    coalescer.push(1);
    coalescer.push(2);
    expect(apply.mock.calls).toEqual([[1], [2]]);
  });
});
