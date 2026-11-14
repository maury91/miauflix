import type { PlayerMedia } from '@features/player/lib/avplay-media';
import type { PlaybackDelivery } from '@miauflix/backend';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startAudioPlayback } = vi.hoisted(() => ({ startAudioPlayback: vi.fn() }));
vi.mock('@features/player/lib/audio-playback', () => ({ startAudioPlayback }));

import { useAudioDelivery } from './useAudioDelivery';
import type { PlaybackSource } from './usePlaybackSource';

const tracks = [
  { index: 1, language: 'en', title: null, codec: 'aac', channels: 2, isDefault: true },
  {
    index: 2,
    language: 'it',
    title: null,
    codec: 'ac3',
    channels: 6,
    isDefault: false,
    canPlayDirect: false,
    mimeType: 'video/mp4; codecs="avc1, mp4a.40.2"',
  },
];

function sessionWith(delivery: Partial<PlaybackDelivery>) {
  return {
    streamingKey: 'key',
    streamUrl: '/api/stream/key',
    delivery: {
      mode: 'direct',
      audioCodec: 'aac',
      durationSeconds: 600,
      mimeType: 'video/mp4',
      audioTracks: tracks,
      defaultAudioTrackIndex: 1,
      ...delivery,
    },
  } as unknown as PlaybackSource['session'];
}

function renderAudio(session: PlaybackSource['session'], video: PlayerMedia, avplay = false) {
  const options = {
    session,
    deliveryUpdate: null as PlaybackSource['deliveryUpdate'],
    avplay,
    videoRef: { current: video },
    resume: {
      resume: undefined,
      resumeRef: { current: undefined },
      hasProgress: true,
      resumeApplied: { current: false },
    },
    setStatus: vi.fn(),
    failPlayback: vi.fn(),
    restartSession: vi.fn(),
    pictureHeld: false,
    settlePendingFailure: vi.fn(),
  };
  return { ...renderHook(props => useAudioDelivery(props), { initialProps: options }), options };
}

describe('useAudioDelivery', () => {
  beforeEach(() => {
    startAudioPlayback.mockReset().mockReturnValue(() => undefined);
  });

  it('seeks a direct stream on the element and plays it through AVPlay when available', () => {
    const video = { currentTime: 0, paused: false } as PlayerMedia;
    const { result } = renderAudio(sessionWith({}), video, true);
    expect(result.current.audioDelivery).toBeUndefined();
    expect(result.current.playsInAvplay).toBe(true);
    act(() => result.current.seekTo(42));
    expect(video.currentTime).toBe(42);
  });

  it('plays a remux through AVPlay and switches its tracks there', () => {
    const enabled: boolean[] = [true, false];
    const video = {
      currentTime: 0,
      paused: false,
      audioTracks: enabled.map((_, index) => ({
        get enabled() {
          return enabled[index];
        },
        set enabled(value: boolean) {
          enabled[index] = value;
        },
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as PlayerMedia;
    const remuxTracks = tracks.map(track => ({
      ...track,
      canPlayDirect: true,
      mimeType: undefined,
    }));
    const { result } = renderAudio(
      sessionWith({ mode: 'remux', audioTracks: remuxTracks }),
      video,
      true
    );
    expect(result.current.playsInAvplay).toBe(true);
    act(() => result.current.selectAudioTrack(2));
    expect(result.current.audioDelivery).toBeUndefined();
    expect(startAudioPlayback).not.toHaveBeenCalled();
    expect(enabled).toEqual([false, true]);
  });

  it('restarts converted audio at the new position instead of seeking the element', () => {
    const video = document.createElement('video');
    const { result, options } = renderAudio(sessionWith({ mode: 'audio-transcode' }), video, true);
    expect(result.current.playsInAvplay).toBe(false);
    expect(startAudioPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/stream/key/audio', startSeconds: 0 })
    );

    act(() => result.current.seekTo(120));
    expect(result.current.pendingPosition).toBe(120);
    expect(startAudioPlayback).toHaveBeenLastCalledWith(
      expect.objectContaining({ startSeconds: 120 })
    );
    expect(options.resume.resumeApplied.current).toBe(true);
  });

  it('converts audio when the element cannot switch to the chosen track', () => {
    const video = document.createElement('video');
    video.currentTime = 30;
    const { result } = renderAudio(sessionWith({}), video);
    act(() => result.current.resetForSession({ delivery: { defaultAudioTrackIndex: 1 } } as never));
    expect(result.current.audioDelivery).toBeUndefined();

    act(() => result.current.selectAudioTrack(2));
    expect(result.current.audioTrackIndex).toBe(2);
    expect(result.current.audioDelivery).toBeDefined();
    expect(startAudioPlayback).toHaveBeenLastCalledWith(
      expect.objectContaining({ startSeconds: 30, audioTrackIndex: 2 })
    );
  });

  it('enables the native audio track at the chosen track position in the list', () => {
    const nativeTracks = [{ enabled: true }, { enabled: false }];
    const video = Object.assign(new EventTarget(), {
      currentTime: 0,
      paused: false,
      audioTracks: Object.assign(nativeTracks, { length: 2 }),
    }) as unknown as PlayerMedia;
    const playable = tracks.map(track => ({ ...track, canPlayDirect: true }));
    const { result } = renderAudio(sessionWith({ audioTracks: playable }), video);

    act(() => result.current.selectAudioTrack(2));

    expect(result.current.audioDelivery).toBeUndefined();
    expect(nativeTracks.map(track => track.enabled)).toEqual([false, true]);
  });

  it('asks for a new session when the backend says to recreate it', () => {
    const video = { currentTime: 0, paused: false } as PlayerMedia;
    const { rerender, options } = renderAudio(sessionWith({}), video);
    rerender({ ...options, deliveryUpdate: { type: 'recreate' } as never });
    expect(options.restartSession).toHaveBeenCalledTimes(1);
    expect(options.restartSession).toHaveBeenCalledWith(false);
  });

  it('keeps the converted picture on a TV while the new session takes over', () => {
    const stop = vi.fn();
    startAudioPlayback.mockReturnValue(stop);
    const video = document.createElement('video');
    const converting = sessionWith({ mode: 'audio-transcode' });
    const { rerender, options } = renderAudio(converting, video, true);
    expect(startAudioPlayback).toHaveBeenCalledTimes(1);

    rerender({ ...options, deliveryUpdate: { type: 'recreate' } as never });
    expect(options.restartSession).toHaveBeenCalledWith(true);

    // The new session plays the TV version in AVPlay: converted audio stops, its frame stays.
    rerender({ ...options, session: sessionWith({ mode: 'remux' }), pictureHeld: true });
    expect(stop).toHaveBeenCalledWith({ keepPicture: true });
  });
});
