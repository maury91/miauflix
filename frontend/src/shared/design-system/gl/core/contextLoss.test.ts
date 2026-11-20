import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextLossPolicy } from './contextLoss';

describe('ContextLossPolicy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the context to come back', () => {
    const giveUp = vi.fn();
    const policy = new ContextLossPolicy(giveUp, 3000, 3);
    policy.lost();
    vi.advanceTimersByTime(2999);
    policy.restored();
    vi.advanceTimersByTime(10_000);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('gives up on a context not restored in time, once', () => {
    const giveUp = vi.fn();
    const policy = new ContextLossPolicy(giveUp, 3000, 3);
    policy.lost();
    vi.advanceTimersByTime(3000);
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(giveUp.mock.calls[0][0]).toMatch(/not restored/);

    policy.lost();
    vi.advanceTimersByTime(3000);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it('gives up at once on the last loss allowed, even restored each time', () => {
    const giveUp = vi.fn();
    const policy = new ContextLossPolicy(giveUp, 3000, 3);
    policy.lost();
    policy.restored();
    policy.lost();
    policy.restored();
    expect(giveUp).not.toHaveBeenCalled();
    policy.lost();
    expect(giveUp).toHaveBeenCalledWith('WebGL context lost 3 times');
  });

  it('does nothing once disposed', () => {
    const giveUp = vi.fn();
    const policy = new ContextLossPolicy(giveUp, 3000, 3);
    policy.lost();
    policy.dispose();
    vi.advanceTimersByTime(3000);
    expect(giveUp).not.toHaveBeenCalled();
  });
});
