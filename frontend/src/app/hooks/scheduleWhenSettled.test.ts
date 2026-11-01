import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scheduleWhenSettled } from './useIntroController';

describe('scheduleWhenSettled', () => {
  let frames: FrameRequestCallback[] = [];
  let idle: (() => void) | null = null;
  const frame = (at: number) => {
    const pending = frames;
    frames = [];
    pending.forEach(callback => callback(at));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    idle = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback;
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', () => (idle = null));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('waits for every image on the page to load before watching frames', () => {
    const image = document.createElement('img');
    let complete = false;
    Object.defineProperty(image, 'complete', { get: () => complete });
    document.body.append(image);
    const callback = vi.fn();
    scheduleWhenSettled(callback);
    idle!();
    vi.advanceTimersByTime(300);
    expect(frames).toHaveLength(0);

    complete = true;
    vi.advanceTimersByTime(100);
    let now = 0;
    for (let index = 0; index < 7; index += 1) frame((now += 16));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('waits for an idle moment, then for six smooth frames in a row', () => {
    const callback = vi.fn();
    scheduleWhenSettled(callback);
    expect(frames).toHaveLength(0);
    idle!();

    let now = 0;
    // A slow frame (the compositor still painting) restarts the count
    for (const gap of [16, 16, 16, 250, 16, 16, 16, 16, 16]) frame((now += gap));
    expect(callback).not.toHaveBeenCalled();
    frame((now += 16));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });

  it('starts anyway on a device that never settles, and can be cancelled', () => {
    const callback = vi.fn();
    scheduleWhenSettled(callback);
    idle!();
    vi.advanceTimersByTime(5_000);
    expect(callback).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const cancel = scheduleWhenSettled(cancelled);
    cancel();
    vi.advanceTimersByTime(5_000);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
