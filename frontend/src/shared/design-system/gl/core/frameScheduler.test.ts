import { describe, expect, it, vi } from 'vitest';

import { FrameBudget, type FrameClock, FrameScheduler } from './frameScheduler';

/** A clock whose frames run when the test says, and whose time it sets. */
function fakeClock() {
  let time = 0;
  let next = 1;
  const callbacks = new Map<number, (time: number) => void>();
  const clock: FrameClock = {
    request: callback => {
      callbacks.set(next, callback);
      return next++;
    },
    cancel: handle => void callbacks.delete(handle),
    now: () => time,
  };
  return {
    clock,
    advance: (ms: number) => (time += ms),
    pending: () => callbacks.size,
    runFrame() {
      const [handle, callback] = [...callbacks][0];
      callbacks.delete(handle);
      callback(time);
    },
  };
}

describe('FrameBudget', () => {
  it('lets each kind run its first item, then others while time is left', () => {
    const { clock, advance } = fakeClock();
    const budget = new FrameBudget(clock, 8);

    expect(budget.allows(0)).toBe(true);
    budget.run('upload', () => advance(5));
    expect(budget.allows(1)).toBe(true);
    budget.run('text', () => advance(4));

    expect(budget.left()).toBe(-1);
    expect(budget.allows(1)).toBe(false);
    // A kind that hasn't run yet still gets one
    expect(budget.allows(0)).toBe(true);
    expect(budget.spent).toEqual({ upload: 5, text: 4, bake: 0 });
  });

  it('times an item that throws', () => {
    const { clock, advance } = fakeClock();
    const budget = new FrameBudget(clock, 8);

    expect(() =>
      budget.run('bake', () => {
        advance(3);
        throw new Error('bake failed');
      })
    ).toThrow('bake failed');
    expect(budget.spent.bake).toBe(3);
  });
});

describe('FrameScheduler', () => {
  it('asks for one frame however often it is invalidated', () => {
    const { clock, pending, runFrame } = fakeClock();
    const frame = vi.fn(() => false);
    const scheduler = new FrameScheduler({ frame, budgetMs: 8, clock });

    scheduler.invalidate();
    scheduler.invalidate();
    expect(pending()).toBe(1);

    runFrame();
    expect(frame).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(0);
  });

  it('keeps running while the frame wants more', () => {
    const { clock, pending, runFrame } = fakeClock();
    let frames = 0;
    const scheduler = new FrameScheduler({ frame: () => ++frames < 3, budgetMs: 8, clock });

    scheduler.invalidate();
    runFrame();
    runFrame();
    expect(pending()).toBe(1);
    runFrame();
    expect(pending()).toBe(0);
    expect(frames).toBe(3);
  });

  it('gives each frame a fresh budget', () => {
    const { clock, advance, runFrame } = fakeClock();
    const left: number[] = [];
    const scheduler = new FrameScheduler({
      frame: (_, budget) => {
        budget.run('text', () => advance(6));
        left.push(budget.left());
        return left.length < 2;
      },
      budgetMs: 8,
      clock,
    });

    scheduler.invalidate();
    runFrame();
    runFrame();
    expect(left).toEqual([2, 2]);
  });

  it('reports a frame that throws and keeps going', () => {
    const { clock, pending, runFrame } = fakeClock();
    const onError = vi.fn();
    const scheduler = new FrameScheduler({
      frame: () => {
        throw new Error('bad frame');
      },
      onError,
      budgetMs: 8,
      clock,
    });

    scheduler.invalidate();
    runFrame();
    expect(onError).toHaveBeenCalledWith(new Error('bad frame'));
    expect(pending()).toBe(1);
  });

  it('stops once disposed', () => {
    const { clock, pending } = fakeClock();
    const scheduler = new FrameScheduler({ frame: () => true, budgetMs: 8, clock });

    scheduler.invalidate();
    scheduler.dispose();
    scheduler.invalidate();
    expect(pending()).toBe(0);
  });
});
