import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logOutSessions } from './logOutSessions';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('logOutSessions', () => {
  it('ends sessions one a second, trying a turned-away one again', async () => {
    const calls: string[] = [];
    const turnedAway = new Set(['b']);
    const logOut = vi.fn(async (session: string) => {
      calls.push(session);
      if (turnedAway.delete(session)) return { error: { status: 429 } };
      return {};
    });

    const done = logOutSessions(['a', 'b'], logOut);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['a']);
    // Nothing more within the backend's one-a-second limit
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(1100);
    await done;
    expect(calls).toEqual(['a', 'b', 'b']);
  });

  it('gives up on a session after a few turned-away attempts', async () => {
    const logOut = vi.fn(async () => ({ error: { status: 429 } }));
    const done = logOutSessions(['a'], logOut);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(logOut).toHaveBeenCalledTimes(3);
  });
});
