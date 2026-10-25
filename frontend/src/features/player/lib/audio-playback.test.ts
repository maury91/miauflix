import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendWithinQuota,
  type BufferBudget,
  MAX_AHEAD_SECONDS,
  MIN_AHEAD_SECONDS,
} from './audio-playback';

/** A SourceBuffer over one buffered range, whose appends can fail with a quota error. */
class FakeSourceBuffer extends EventTarget {
  range: [number, number] | null = [0, 0];
  quotaFailures = 0;
  appends = 0;
  removed: Array<[number, number]> = [];

  get buffered() {
    const range = this.range;
    return {
      length: range ? 1 : 0,
      start: () => range![0],
      end: () => range![1],
    } as unknown as TimeRanges;
  }

  appendBuffer() {
    if (this.quotaFailures > 0) {
      this.quotaFailures--;
      throw new DOMException('The SourceBuffer is full', 'QuotaExceededError');
    }
    this.appends++;
    queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
  }

  remove(start: number, end: number) {
    this.removed.push([start, end]);
    if (this.range) this.range = [Math.max(this.range[0], end), this.range[1]];
    queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
  }
}

const setupTest = ({ buffered = [0, 120] as [number, number], currentTime = 50 } = {}) => {
  const buffer = new FakeSourceBuffer();
  buffer.range = buffered;
  const video = { currentTime } as HTMLVideoElement;
  const budget: BufferBudget = { maxAheadSeconds: MAX_AHEAD_SECONDS };
  const controller = new AbortController();
  const append = (playing = true) =>
    appendWithinQuota(
      buffer as unknown as SourceBuffer,
      video,
      new ArrayBuffer(8),
      controller.signal,
      budget,
      playing
    );
  return { buffer, video, budget, controller, append };
};

describe('appendWithinQuota', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends directly when the buffer has room', async () => {
    const { buffer, budget, append } = setupTest();
    await append();
    expect(buffer.appends).toBe(1);
    expect(budget.maxAheadSeconds).toBe(MAX_AHEAD_SECONDS);
  });

  it('on a full buffer evicts behind the playhead, lowers the ahead limit and retries', async () => {
    // 70 s buffered ahead of the playhead when Chrome's byte quota is hit.
    const { buffer, video, budget, append } = setupTest({ buffered: [0, 120], currentTime: 50 });
    buffer.quotaFailures = 1;

    const done = append();
    await vi.advanceTimersByTimeAsync(0);
    expect(buffer.removed).toEqual([[0, 49]]);
    // min(60, 70) * 0.75: read no further ahead than what fit, with some margin.
    expect(budget.maxAheadSeconds).toBe(45);
    expect(buffer.appends).toBe(0);

    // Playback catches up to within the new limit, then the same chunk is appended.
    video.currentTime = 80;
    await vi.advanceTimersByTimeAsync(500);
    await done;
    expect(buffer.appends).toBe(1);
  });

  it('never lowers the ahead limit below the minimum', async () => {
    const { buffer, budget, append } = setupTest({ buffered: [49, 52], currentTime: 50 });
    buffer.quotaFailures = 1;

    const done = append();
    await vi.advanceTimersByTimeAsync(500);
    await done;
    expect(budget.maxAheadSeconds).toBe(MIN_AHEAD_SECONDS);
    expect(buffer.appends).toBe(1);
  });

  it('keeps waiting instead of spinning while nothing can be freed', async () => {
    const { buffer, append } = setupTest({ buffered: [49, 52], currentTime: 50 });
    buffer.quotaFailures = 3;

    const done = append();
    await vi.advanceTimersByTimeAsync(100);
    // One failed attempt, then it waits for playback instead of retrying in a tight loop.
    expect(buffer.quotaFailures).toBe(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(buffer.quotaFailures).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(buffer.appends).toBe(1);
  });

  it('fails a full buffer before playback starts, since nothing will consume it', async () => {
    const { buffer, append } = setupTest();
    buffer.quotaFailures = 1;
    await expect(append(false)).rejects.toThrow('The SourceBuffer is full');
  });

  it('stops waiting when playback is cancelled', async () => {
    const { buffer, controller, append } = setupTest({ buffered: [0, 120], currentTime: 50 });
    buffer.quotaFailures = 1;

    const done = append();
    const failure = expect(done).rejects.toThrow('Playback cancelled');
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await failure;
  });
});
