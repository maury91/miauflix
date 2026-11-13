import type { PlayerMedia } from '@features/player/lib/avplay-media';
import type { PlaybackDelivery } from '@miauflix/backend';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createNextSession } = vi.hoisted(() => ({ createNextSession: vi.fn() }));

vi.mock('@features/player/api/playback.api', () => ({
  useCreateSessionMutation: () => [createNextSession],
}));

import { nextEpisodeKeyOf, usePlaybackPrompts } from './usePlaybackPrompts';
import type { PlaybackSource } from './usePlaybackSource';

const playable = {
  kind: 'episode' as const,
  showMediaId: 1,
  seasonNumber: 1,
  episodeNumber: 1,
};
const nextEpisode = {
  playable: { ...playable, episodeNumber: 2 },
  title: 'Episode 2',
};

function sessionWith(delivery: Partial<PlaybackDelivery>) {
  return {
    streamingKey: 'key',
    delivery: { mode: 'direct', durationSeconds: 1000, ...delivery },
  } as unknown as PlaybackSource['session'];
}

function renderPrompts(
  session: PlaybackSource['session'],
  currentTime: number,
  next: typeof nextEpisode | null = null
) {
  const videoRef = { current: { currentTime, duration: 1000 } as PlayerMedia };
  const seekTo = vi.fn();
  const completeOnce = vi.fn();
  const onPlayNext = vi.fn();
  const view = renderHook(() =>
    usePlaybackPrompts({
      playable,
      nextEpisode: next,
      session,
      avplay: false,
      videoRef,
      seekTo,
      completeOnce,
      onPlayNext,
    })
  );
  return { ...view, videoRef, seekTo, completeOnce, onPlayNext };
}

describe('nextEpisodeKeyOf', () => {
  it('identifies movies and episodes', () => {
    expect(nextEpisodeKeyOf(null)).toBeNull();
    expect(nextEpisodeKeyOf({ playable: { kind: 'movie', mediaId: 4 }, title: '' })).toBe('m:4');
    expect(nextEpisodeKeyOf(nextEpisode)).toBe('e:1:1:2');
  });
});

describe('usePlaybackPrompts', () => {
  beforeEach(() => {
    createNextSession.mockReset().mockReturnValue({ unwrap: () => new Promise(() => undefined) });
  });

  it('offers to skip the intro until its last second, and seeks past it', () => {
    const { result, videoRef, seekTo } = renderPrompts(
      sessionWith({ introStartSeconds: 10, introEndSeconds: 60 }),
      20
    );
    act(() => result.current.updatePrompts());
    expect(result.current.inIntro).toBe(true);

    videoRef.current.currentTime = 59.5;
    act(() => result.current.updatePrompts());
    expect(result.current.inIntro).toBe(false);

    act(() => result.current.skipIntro());
    expect(seekTo).toHaveBeenCalledWith(60);
  });

  it('counts down over credits followed by a scene, then skips to it', () => {
    const { result, videoRef, seekTo } = renderPrompts(
      sessionWith({ creditsStartSeconds: 900, creditsEndSeconds: 950 }),
      901
    );
    act(() => result.current.updatePrompts());
    expect(result.current.skipCountdown).toBe(4);

    videoRef.current.currentTime = 905;
    act(() => result.current.updatePrompts());
    expect(seekTo).toHaveBeenCalledWith(950);
    expect(result.current.skipCountdown).toBeNull();
  });

  it('stops offering the credits skip once watched, until a seek before them', () => {
    const { result, videoRef } = renderPrompts(
      sessionWith({ creditsStartSeconds: 900, creditsEndSeconds: 950 }),
      901
    );
    act(() => result.current.watchCredits());
    act(() => result.current.updatePrompts());
    expect(result.current.skipCountdown).toBeNull();

    videoRef.current.currentTime = 800;
    act(() => {
      result.current.handleSeeked(800);
      result.current.updatePrompts();
    });
    videoRef.current.currentTime = 902;
    act(() => result.current.updatePrompts());
    expect(result.current.skipCountdown).toBe(3);
  });

  it('prepares the next episode, counts down near the end and plays it', async () => {
    createNextSession.mockReturnValue({
      unwrap: () => Promise.resolve({ streamUrl: '/api/stream/next' }),
    });
    const { result, videoRef, completeOnce, onPlayNext } = renderPrompts(
      sessionWith({}),
      950,
      nextEpisode
    );
    await waitFor(() => expect(createNextSession).toHaveBeenCalledTimes(1));
    expect(createNextSession).toHaveBeenCalledWith(
      expect.objectContaining({ playable: nextEpisode.playable, deferDownload: true })
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => result.current.updatePrompts());
    expect(result.current.nextCountdown).toBe(50);

    videoRef.current.currentTime = 1000;
    act(() => result.current.updatePrompts());
    expect(completeOnce).toHaveBeenCalledTimes(1);
    expect(onPlayNext).toHaveBeenCalledTimes(1);
  });

  it('prepares a new next episode while the previous one is still being prepared', async () => {
    createNextSession.mockReturnValue({ unwrap: () => new Promise(() => {}) });
    const session = sessionWith({});
    const videoRef = { current: { currentTime: 950, duration: 1000 } as PlayerMedia };
    const episode3 = { playable: { ...playable, episodeNumber: 3 }, title: 'Episode 3' };
    const { rerender } = renderHook(
      ({ next }) =>
        usePlaybackPrompts({
          playable,
          nextEpisode: next,
          session,
          avplay: false,
          videoRef,
          seekTo: vi.fn(),
          completeOnce: vi.fn(),
          onPlayNext: vi.fn(),
        }),
      { initialProps: { next: nextEpisode } }
    );
    await waitFor(() => expect(createNextSession).toHaveBeenCalledTimes(1));

    rerender({ next: episode3 });

    await waitFor(() => expect(createNextSession).toHaveBeenCalledTimes(2));
    expect(createNextSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ playable: episode3.playable })
    );
  });

  it('does not offer the next episode again after Stay', async () => {
    createNextSession.mockReturnValue({
      unwrap: () => Promise.resolve({ streamUrl: '/api/stream/next' }),
    });
    const { result } = renderPrompts(sessionWith({}), 950, nextEpisode);
    await waitFor(() => expect(createNextSession).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.stay());
    act(() => result.current.updatePrompts());
    expect(result.current.nextCountdown).toBeNull();
  });
});
