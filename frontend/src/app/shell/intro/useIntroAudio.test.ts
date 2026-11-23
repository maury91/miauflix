import { act, renderHook } from '@testing-library/react';
import type { gsap } from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIO_START_TIMEOUT_MS, useIntroAudio } from './useIntroAudio';

/** An audio element whose play() requests the test settles by hand. */
class FakeAudio {
  static last: FakeAudio | null = null;
  currentTime = 0;
  ended = false;
  preload = '';
  src = '';
  requests: { resolve: () => void; reject: (error: Error) => void }[] = [];
  pause = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  constructor() {
    FakeAudio.last = this;
  }

  play() {
    return new Promise<void>((resolve, reject) => this.requests.push({ resolve, reject }));
  }

  /** Settle the latest play() request, or the one at `index`. */
  async plays(index = this.requests.length - 1) {
    await act(async () => this.requests[index]?.resolve());
  }

  async fails(name: string) {
    const error = new Error(name);
    error.name = name;
    await act(async () => this.requests.at(-1)?.reject(error));
  }
}

const flush = () => act(async () => undefined);

const setup = () => {
  const timeline = { pause: vi.fn(), resume: vi.fn() };
  const timelineRef = { current: timeline as unknown as gsap.core.Timeline };
  const hook = renderHook(() => useIntroAudio(timelineRef));
  return { audio: hook.result.current, timeline, element: FakeAudio.last!, unmount: hook.unmount };
};

/** Start, and let the play() request go out. */
const start = async (audio: ReturnType<typeof setup>['audio']) => {
  act(() => audio.start());
  await flush();
};

describe('useIntroAudio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('holds the timeline until the sound plays', async () => {
    const { audio, timeline, element } = setup();
    await start(audio);

    expect(timeline.pause).toHaveBeenCalled();
    expect(audio.isHolding()).toBe(true);
    expect(timeline.resume).not.toHaveBeenCalled();

    await element.plays();
    expect(audio.isHolding()).toBe(false);
    expect(timeline.resume).toHaveBeenCalledTimes(1);
  });

  it('goes on silently when autoplay is blocked', async () => {
    const { audio, timeline, element } = setup();
    await start(audio);

    await element.fails('NotAllowedError');

    expect(audio.isHolding()).toBe(false);
    expect(timeline.resume).toHaveBeenCalledTimes(1);
  });

  it('gives up on a stalled sound, and silences it if it starts late', async () => {
    const { audio, timeline, element } = setup();
    await start(audio);

    act(() => vi.advanceTimersByTime(AUDIO_START_TIMEOUT_MS));
    expect(audio.isHolding()).toBe(false);
    expect(timeline.resume).toHaveBeenCalledTimes(1);

    element.pause.mockClear();
    element.currentTime = 0.4;
    await element.plays();
    expect(element.pause).toHaveBeenCalled();
    expect(element.currentTime).toBe(0);
    expect(timeline.resume).toHaveBeenCalledTimes(1);
  });

  it('keeps a pause made while waiting when it gives up on the sound', async () => {
    const { audio, timeline } = setup();
    await start(audio);

    act(() => audio.pause());
    act(() => vi.advanceTimersByTime(AUDIO_START_TIMEOUT_MS));

    expect(audio.isHolding()).toBe(false);
    expect(timeline.resume).not.toHaveBeenCalled();
  });

  it('keeps holding when a pause interrupts the start, and plays from the start on resume', async () => {
    const { audio, timeline, element } = setup();
    await start(audio);

    act(() => audio.pause());
    await element.fails('AbortError');
    expect(audio.isHolding()).toBe(true);
    expect(timeline.resume).not.toHaveBeenCalled();

    element.currentTime = 0.2;
    act(() => audio.resume());
    await flush();
    expect(element.requests).toHaveLength(2);
    expect(element.currentTime).toBe(0);
    expect(audio.isHolding()).toBe(true);

    await element.plays();
    expect(audio.isHolding()).toBe(false);
    expect(timeline.resume).toHaveBeenCalledTimes(1);
  });

  it('waits at the start when the sound begins while paused', async () => {
    const { audio, timeline, element } = setup();
    await start(audio);

    act(() => audio.pause());
    await element.plays();
    expect(element.currentTime).toBe(0);
    expect(audio.isHolding()).toBe(true);
    expect(timeline.resume).not.toHaveBeenCalled();

    act(() => audio.resume());
    await flush();
    await element.plays();
    expect(timeline.resume).toHaveBeenCalledTimes(1);
  });

  it('does not play again when stopped before a resume goes out', async () => {
    const { audio, element } = setup();
    await start(audio);
    await element.plays();
    element.currentTime = 0.3;

    act(() => {
      audio.pause();
      audio.resume();
      audio.stop();
    });
    await flush();

    expect(element.requests).toHaveLength(1);
    expect(element.currentTime).toBe(0);
  });

  it("leaves a newer start's sound alone when a stopped start's play succeeds late", async () => {
    const { audio, timeline, element } = setup();
    await start(audio);
    act(() => audio.stop());
    await start(audio);
    expect(element.requests).toHaveLength(2);

    element.pause.mockClear();
    await element.plays(0);
    expect(element.pause).not.toHaveBeenCalled();
    expect(audio.isHolding()).toBe(true);

    await element.plays(1);
    expect(audio.isHolding()).toBe(false);
    expect(timeline.resume).toHaveBeenCalledTimes(1);
  });

  it('drops the hold on stop and on unmount, silencing a late start', async () => {
    const { audio, timeline, element, unmount } = setup();
    await start(audio);

    act(() => audio.stop());
    expect(audio.isHolding()).toBe(false);
    element.pause.mockClear();
    await element.plays();
    expect(element.pause).toHaveBeenCalled();
    expect(timeline.resume).not.toHaveBeenCalled();

    await start(audio);
    unmount();
    expect(audio.isHolding()).toBe(false);
  });
});
