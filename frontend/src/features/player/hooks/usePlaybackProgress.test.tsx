import type { PlayerMedia } from '@features/player/lib/avplay-media';
import type { PlaybackDelivery, ProgressEntry } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saved, resumeEntry, progressLoaded } = vi.hoisted(() => ({
  saved: vi.fn(),
  resumeEntry: { current: undefined as ProgressEntry | undefined },
  progressLoaded: { current: true },
}));

vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => resumeEntry.current,
  useGetProgressQuery: () => ({ data: progressLoaded.current ? { progress: [] } : undefined }),
}));
vi.mock('@features/realtime/realtime.middleware', () => ({
  saveProgressWithRealtime: (progress: unknown) => () => saved(progress),
}));

import { resumePosition, usePlaybackProgress, useResumePoint } from './usePlaybackProgress';

const playable = { kind: 'movie' as const, mediaId: 7 };

function media(currentTime: number, duration: number, paused = false) {
  return { currentTime, duration, paused } as PlayerMedia;
}

function renderProgress(video: PlayerMedia | null, audioDelivery?: PlaybackDelivery) {
  const store = configureStore({ reducer: { noop: () => null } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  const videoRef = { current: video };
  const audioPreparing = { current: false };
  const view = renderHook(
    () => {
      const resume = useResumePoint(playable);
      return {
        resume,
        ...usePlaybackProgress({
          playable,
          videoRef,
          audioPreparing,
          delivery: audioDelivery,
          audioDelivery,
          resume,
        }),
      };
    },
    { wrapper }
  );
  return { ...view, videoRef, audioPreparing };
}

describe('resumePosition', () => {
  it('scales the saved fraction to the new duration, one second short of the end', () => {
    expect(resumePosition({ positionSeconds: 30, durationSeconds: 60 }, 100)).toBe(50);
    expect(resumePosition({ positionSeconds: 60, durationSeconds: 60 }, 100)).toBe(99);
  });
});

describe('usePlaybackProgress', () => {
  beforeEach(() => {
    saved.mockReset();
    progressLoaded.current = true;
    resumeEntry.current = undefined;
  });
  afterEach(() => vi.useRealTimers());

  it('reports a snapshot clamped to the duration', () => {
    const { result } = renderProgress(media(130, 120));
    act(() => result.current.saveProgress('paused'));
    expect(saved).toHaveBeenCalledWith({
      playable,
      positionSeconds: 120,
      durationSeconds: 120,
      state: 'paused',
    });
  });

  it('keeps the last snapshot while converted audio prepares', () => {
    const { result, videoRef, audioPreparing } = renderProgress(media(40, 120));
    expect(result.current.readProgressSnapshot()).toEqual({
      positionSeconds: 40,
      durationSeconds: 120,
    });
    audioPreparing.current = true;
    videoRef.current = media(0, 120);
    expect(result.current.readProgressSnapshot()).toEqual({
      positionSeconds: 40,
      durationSeconds: 120,
    });
  });

  it('completes once, and does not report a completed target as paused when left', () => {
    const { result } = renderProgress(media(100, 120));
    act(() => {
      result.current.completeOnce();
      result.current.completeOnce();
    });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed' }));
    expect(result.current.captureLeave(playable)).toBeNull();
    result.current.handlePause();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('returns a paused save for the left target until a new request resets it', () => {
    const { result } = renderProgress(media(10, 120));
    const other = { kind: 'movie' as const, mediaId: 8 };
    const leave = result.current.captureLeave(other);
    leave?.();
    expect(saved).toHaveBeenCalledWith({
      playable: other,
      positionSeconds: 10,
      durationSeconds: 120,
      state: 'paused',
    });
  });

  it('reports playing progress every ten seconds', () => {
    vi.useFakeTimers();
    renderProgress(media(10, 120));
    act(() => vi.advanceTimersByTime(10_000));
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ state: 'playing' }));
  });

  it('resumes a direct stream on loadedmetadata, once', () => {
    resumeEntry.current = {
      playable,
      positionSeconds: 30,
      durationSeconds: 60,
      state: 'paused',
    } as ProgressEntry;
    const { result } = renderProgress(null);
    const element = media(0, 100);
    result.current.handleLoadedMetadata(element);
    expect(element.currentTime).toBe(50);
    expect(result.current.resume.resumeApplied.current).toBe(true);
    element.currentTime = 5;
    result.current.handleLoadedMetadata(element);
    expect(element.currentTime).toBe(5);
  });

  it('waits for a usable duration before resuming a direct stream', () => {
    resumeEntry.current = {
      playable,
      positionSeconds: 30,
      durationSeconds: 60,
      state: 'paused',
    } as ProgressEntry;
    const { result } = renderProgress(null);
    const element = new EventTarget() as EventTarget & { currentTime: number; duration: number };
    element.currentTime = 0;
    element.duration = Number.NaN;

    result.current.handleLoadedMetadata(element as unknown as PlayerMedia);
    expect(element.currentTime).toBe(0);
    expect(result.current.resume.resumeApplied.current).toBe(false);

    element.duration = 100;
    element.dispatchEvent(new Event('durationchange'));
    expect(element.currentTime).toBe(50);
    expect(result.current.resume.resumeApplied.current).toBe(true);
  });

  it('drops a resume waiting for a duration when a new request starts', () => {
    resumeEntry.current = {
      playable,
      positionSeconds: 30,
      durationSeconds: 60,
      state: 'paused',
    } as ProgressEntry;
    const { result } = renderProgress(null);
    const element = new EventTarget() as EventTarget & { currentTime: number; duration: number };
    element.currentTime = 0;
    element.duration = Number.POSITIVE_INFINITY;

    result.current.handleLoadedMetadata(element as unknown as PlayerMedia);
    result.current.resetForRequest();
    element.duration = 100;
    element.dispatchEvent(new Event('durationchange'));
    expect(element.currentTime).toBe(0);
  });

  it('resumes once the duration is known when progress loads after loadedmetadata', () => {
    progressLoaded.current = false;
    resumeEntry.current = undefined;
    const element = new EventTarget() as EventTarget & { currentTime: number; duration: number };
    element.currentTime = 0;
    element.duration = Number.NaN;
    const { result, rerender } = renderProgress(element as unknown as PlayerMedia);
    result.current.handleLoadedMetadata(element as unknown as PlayerMedia);

    resumeEntry.current = {
      playable,
      positionSeconds: 30,
      durationSeconds: 60,
      state: 'paused',
    } as ProgressEntry;
    progressLoaded.current = true;
    rerender();
    expect(element.currentTime).toBe(0);

    element.duration = 100;
    element.dispatchEvent(new Event('durationchange'));
    expect(element.currentTime).toBe(50);
  });
});
