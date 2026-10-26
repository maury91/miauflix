import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendWithinQuota,
  type BufferBudget,
  MAX_AHEAD_SECONDS,
  MAX_STALLED_RETRIES,
  MIN_AHEAD_SECONDS,
  STALL_CHECK_MS,
  STALL_CHECKS,
  stallRecoveryTime,
  upcomingGap,
  watchForStalls,
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

  it('on a full buffer lowers the ahead limit and retries without removing media', async () => {
    // 70 s buffered ahead of the playhead when Chrome's byte quota is hit.
    const { buffer, video, budget, append } = setupTest({ buffered: [0, 120], currentTime: 50 });
    buffer.quotaFailures = 1;

    const done = append();
    await vi.advanceTimersByTimeAsync(0);
    // remove() extends to the next keyframe, so evicting near the playhead would delete the
    // frames being played; the browser evicts what is behind the playhead on its own.
    expect(buffer.removed).toEqual([]);
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

  it('reports the error when retries free nothing and the playhead does not move', async () => {
    const { buffer, append } = setupTest({ buffered: [49, 52], currentTime: 50 });
    buffer.quotaFailures = Infinity;

    const done = append();
    const failure = expect(done).rejects.toThrow('playback is not advancing');
    await vi.advanceTimersByTimeAsync(250 * (MAX_STALLED_RETRIES + 1));
    await failure;
    expect(buffer.appends).toBe(0);
  });

  it('reports the error when the playhead stalls while the buffer is over the ahead limit', async () => {
    // 70 s ahead, above the lowered 45 s limit, and the playhead never moves.
    const { buffer, append } = setupTest({ buffered: [0, 120], currentTime: 50 });
    buffer.quotaFailures = 1;

    const done = append();
    const failure = expect(done).rejects.toThrow('playback is not advancing');
    await vi.advanceTimersByTimeAsync(250 * (MAX_STALLED_RETRIES + 1));
    await failure;
    expect(buffer.appends).toBe(0);
  });

  it('keeps retrying while the playhead advances', async () => {
    const { buffer, video, append } = setupTest({ buffered: [49, 52], currentTime: 50 });
    buffer.quotaFailures = MAX_STALLED_RETRIES * 2;

    const done = append();
    for (let step = 0; step <= MAX_STALLED_RETRIES * 2; step++) {
      video.currentTime += 0.25;
      await vi.advanceTimersByTimeAsync(250);
    }
    await done;
    expect(buffer.appends).toBe(1);
  });

  it('waits without giving up while playback is paused', async () => {
    const { buffer, video, append } = setupTest({ buffered: [49, 52], currentTime: 50 });
    buffer.quotaFailures = 1;
    (video as { paused: boolean }).paused = true;

    const done = append();
    await vi.advanceTimersByTimeAsync(250 * MAX_STALLED_RETRIES * 2);
    expect(buffer.appends).toBe(0);

    (video as { paused: boolean }).paused = false;
    await vi.advanceTimersByTimeAsync(250);
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

const ranges = (...list: Array<[number, number]>) =>
  ({
    length: list.length,
    start: (index: number) => list[index][0],
    end: (index: number) => list[index][1],
  }) as unknown as TimeRanges;

describe('stallRecoveryTime', () => {
  it('nudges forward when stuck inside a range with media ahead', () => {
    expect(stallRecoveryTime(ranges([177.26, 208.48]), 180.05)).toBeCloseTo(180.15);
  });

  it('jumps a gap to the next range', () => {
    expect(stallRecoveryTime(ranges([166.83, 177.18], [177.26, 208.48]), 177.18)).toBeCloseTo(
      177.27
    );
  });

  it('jumps to the next range when stuck just before a gap', () => {
    expect(stallRecoveryTime(ranges([166.83, 177.18], [177.26, 208.48]), 177.1)).toBeCloseTo(
      177.27
    );
  });

  it('leaves ordinary buffering at the end of the buffer alone', () => {
    expect(stallRecoveryTime(ranges([166.83, 177.18]), 177.18)).toBeUndefined();
    expect(stallRecoveryTime(ranges([166.83, 177.18]), 177)).toBeUndefined();
    expect(stallRecoveryTime(ranges(), 10)).toBeUndefined();
  });
});

describe('upcomingGap', () => {
  const gapped = ranges([166.83, 177.18], [177.26, 208.48]);

  it('finds a small gap just ahead of the playhead', () => {
    const gap = upcomingGap(gapped, 177);
    expect(gap?.at).toBe(177.18);
    expect(gap?.to).toBeCloseTo(177.27);
  });

  it('ignores a gap that is still far ahead', () => {
    expect(upcomingGap(gapped, 170)).toBeUndefined();
  });

  it('ignores a gap too long to skip and the end of the buffer', () => {
    expect(upcomingGap(ranges([166.83, 177.18], [180, 208.48]), 177)).toBeUndefined();
    expect(upcomingGap(gapped, 208.2)).toBeUndefined();
  });
});

describe('watchForStalls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setupVideo = (currentTime: number, buffered = ranges([177.26, 208.48])) => {
    const quality = { totalVideoFrames: 0 };
    const video = {
      currentTime,
      paused: false,
      seeking: false,
      ended: false,
      playbackRate: 1,
      buffered,
      getVideoPlaybackQuality: () => quality,
    } as unknown as HTMLVideoElement;
    const controller = new AbortController();
    watchForStalls(video, controller.signal);
    return { video, controller, quality };
  };

  it('nudges a playhead that stops with media buffered ahead', () => {
    const { video } = setupVideo(180.05);
    vi.advanceTimersByTime(STALL_CHECK_MS * STALL_CHECKS);
    expect(video.currentTime).toBeCloseTo(180.15);
  });

  it('leaves a moving playhead alone', () => {
    const { video, quality } = setupVideo(180);
    for (let check = 0; check < STALL_CHECKS * 3; check++) {
      video.currentTime += 0.5;
      quality.totalVideoFrames += 6;
      vi.advanceTimersByTime(STALL_CHECK_MS);
    }
    expect(video.currentTime).toBe(180 + 0.5 * STALL_CHECKS * 3);
  });

  it('leaves paused playback alone', () => {
    const { video } = setupVideo(180);
    (video as { paused: boolean }).paused = true;
    vi.advanceTimersByTime(STALL_CHECK_MS * STALL_CHECKS * 3);
    expect(video.currentTime).toBe(180);
  });

  it('stops watching when playback is cancelled', () => {
    const { video, controller } = setupVideo(180);
    controller.abort();
    vi.advanceTimersByTime(STALL_CHECK_MS * STALL_CHECKS * 3);
    expect(video.currentTime).toBe(180);
  });

  it('jumps a small gap just before the playhead reaches it', () => {
    const { video, quality } = setupVideo(177, ranges([166.83, 177.18], [177.26, 208.48]));
    vi.advanceTimersByTime(STALL_CHECK_MS);
    // Scheduled for 0.05 s before the gap: 177.13 - 177 = 130 ms after the check.
    video.currentTime = 177.13;
    quality.totalVideoFrames += 3;
    vi.advanceTimersByTime(130);
    expect(video.currentTime).toBeCloseTo(177.27);
  });

  it('does not jump when a seek moved the playhead elsewhere', () => {
    const { video } = setupVideo(177, ranges([166.83, 177.18], [177.26, 208.48]));
    vi.advanceTimersByTime(STALL_CHECK_MS);
    video.currentTime = 170;
    vi.advanceTimersByTime(130);
    expect(video.currentTime).toBe(170);
  });

  it('re-seeks in place when the playhead moves but no frame is decoded', () => {
    const { video } = setupVideo(178);
    const seeks: number[] = [];
    let time = 178;
    Object.defineProperty(video, 'currentTime', {
      get: () => time,
      set: (value: number) => {
        seeks.push(value);
        time = value;
      },
    });
    for (let check = 0; check <= STALL_CHECKS; check++) {
      time += 0.25;
      vi.advanceTimersByTime(STALL_CHECK_MS);
    }
    expect(seeks).toEqual([179]);
  });
});
