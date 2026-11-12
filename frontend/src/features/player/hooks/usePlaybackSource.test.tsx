import type { CreatePlaybackSessionResponse } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSession } = vi.hoisted(() => ({ createSession: vi.fn() }));

vi.mock('@features/player/api/playback.api', async () => {
  const React = await import('react');
  return {
    useCreateSessionMutation: () => {
      const [data, setData] = React.useState<CreatePlaybackSessionResponse | undefined>();
      const reset = React.useCallback(() => setData(undefined), []);
      const trigger = React.useCallback((request: unknown) => {
        const promise = (
          createSession(request) as { unwrap: () => Promise<CreatePlaybackSessionResponse> }
        )
          .unwrap()
          .then(result => {
            setData(result);
            return result;
          });
        return { unwrap: () => promise };
      }, []);
      return [trigger, { data, reset }] as const;
    },
  };
});

import { realtimeSlice } from '@store/slices/realtime';

import { type PlaybackSessionHandlers, usePlaybackSource } from './usePlaybackSource';

const playable = { kind: 'movie' as const, mediaId: 7 };

function sessionFor(sourceId: number): CreatePlaybackSessionResponse {
  return {
    playbackId: `playback-${sourceId}`,
    streamingKey: `key-${sourceId}`,
    streamUrl: `/api/stream/key-${sourceId}`,
    source: {
      id: sourceId,
      quality: null,
      size: 100,
      videoCodec: null,
      broadcasters: null,
      watchers: null,
    },
    preparation: { state: 'warm', verifiedBytes: 100, allocatedBytes: 100 },
    expiresAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderSource(handlers: PlaybackSessionHandlers) {
  const store = configureStore({ reducer: { realtime: realtimeSlice.reducer } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(
    ({ title, subtitleKey }: { title: string; subtitleKey: string }) => {
      const source = usePlaybackSource({ playable, title, avplay: false, subtitleKey });
      source.handlers.current = handlers;
      return source;
    },
    { wrapper, initialProps: { title: 'Film', subtitleKey: 'subtitles' } }
  );
}

describe('usePlaybackSource', () => {
  const handlers = {
    onRequestStart: vi.fn(),
    onSessionCreated: vi.fn(),
    onTargetLeave: vi.fn(() => null),
  };

  beforeEach(() => {
    createSession.mockReset();
    handlers.onRequestStart.mockClear();
    handlers.onSessionCreated.mockClear();
    handlers.onTargetLeave.mockClear();
  });

  it('creates a session, reports it to the handlers, and marks the subtitle key', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result } = renderSource(handlers);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.session?.streamingKey).toBe('key-1');
    expect(handlers.onRequestStart).toHaveBeenCalledTimes(1);
    expect(handlers.onSessionCreated).toHaveBeenCalledWith(sessionFor(1));
    expect(result.current.sessionSubtitleKey.current).toBe('subtitles');
  });

  it('keeps a live session when the title or subtitle key changes', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result, rerender } = renderSource(handlers);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ title: 'Film (2026)', subtitleKey: 'user-subtitles' });

    expect(result.current.status).toBe('ready');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(handlers.onRequestStart).toHaveBeenCalledTimes(1);
    expect(handlers.onSessionCreated).toHaveBeenCalledTimes(1);
    expect(result.current.sessionSubtitleKey.current).toBe('user-subtitles');
  });

  it('asks for another source after a stream failure, and stops when it repeats', async () => {
    createSession
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(1)) })
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(2)) })
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result } = renderSource(handlers);
    await waitFor(() => expect(result.current.session?.source.id).toBe(1));

    act(() => result.current.handleMediaError());
    await waitFor(() => expect(result.current.session?.source.id).toBe(2));
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ avoidSourceIds: [1] })
    );

    act(() => result.current.handleMediaError());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ avoidSourceIds: [1, 2] })
    );
    expect(result.current.error).toContain('could not load any of its sources');
    expect(result.current.session).toBeNull();
  });

  it('starts over from the first source on retry', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result } = renderSource(handlers);
    await waitFor(() => expect(result.current.session?.source.id).toBe(1));
    act(() => result.current.failPlayback('Audio failed'));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Audio failed');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
    expect(createSession).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ avoidSourceIds: expect.anything() })
    );
  });

  it('runs the leave handler for the target when unmounted', async () => {
    const leave = vi.fn();
    handlers.onTargetLeave.mockImplementation(() => leave);
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result, unmount } = renderSource(handlers);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    unmount();
    expect(handlers.onTargetLeave).toHaveBeenCalledWith(playable);
    await Promise.resolve();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
