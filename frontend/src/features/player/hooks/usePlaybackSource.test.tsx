import type { CreatePlaybackSessionResponse } from '@miauwatch/backend';
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
    ({
      title,
      subtitleKey,
      target = playable,
      audioLanguage,
      audioLanguageKnown,
    }: {
      title: string;
      subtitleKey: string;
      target?: typeof playable;
      audioLanguage?: string;
      audioLanguageKnown?: boolean;
    }) => {
      const source = usePlaybackSource({
        playable: target,
        title,
        avplay: false,
        subtitleKey,
        audioLanguage,
        audioLanguageKnown,
      });
      source.handlers.current = handlers;
      return source;
    },
    {
      wrapper,
      initialProps: { title: 'Film', subtitleKey: 'subtitles' } as {
        title: string;
        subtitleKey: string;
        target?: typeof playable;
        audioLanguage?: string;
        audioLanguageKnown?: boolean;
      },
    }
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

  it('waits for the audio language once, and keeps the session when details change after', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const other = { kind: 'movie' as const, mediaId: 8 };
    const { result, rerender } = renderSource(handlers);
    rerender({ title: 'Film', subtitleKey: 'subtitles', audioLanguageKnown: false });
    // The first render already asked; a target that starts unknown is what the player sees
    createSession.mockClear();
    handlers.onRequestStart.mockClear();
    rerender({
      title: 'Film',
      subtitleKey: 'subtitles',
      target: other,
      audioLanguageKnown: false,
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(result.current.status).toBe('checking');

    rerender({
      title: 'Film',
      subtitleKey: 'subtitles',
      target: other,
      audioLanguage: 'ja',
      audioLanguageKnown: true,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ playable: other }));

    rerender({
      title: 'Film',
      subtitleKey: 'subtitles',
      target: other,
      audioLanguageKnown: false,
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(handlers.onRequestStart).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
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

  it('lets the replacement of a held session arrive when the held one fails', async () => {
    createSession.mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result } = renderSource(handlers);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let replace: (session: CreatePlaybackSessionResponse) => void = () => undefined;
    createSession.mockReturnValueOnce({
      unwrap: () => new Promise<CreatePlaybackSessionResponse>(resolve => (replace = resolve)),
    });
    act(() => result.current.restartSession(true));
    expect(result.current.pictureHeld).toBe(true);

    act(() => result.current.failPlayback('The held stream stopped'));
    expect(result.current.status).not.toBe('error');
    await act(async () => replace(sessionFor(2)));
    expect(result.current.session?.playbackId).toBe('playback-2');
  });

  it('shows nothing of a held session once another title plays', async () => {
    createSession.mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(1)) });
    const { result, rerender } = renderSource(handlers);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    createSession.mockReturnValue({ unwrap: () => new Promise(() => undefined) });
    act(() => result.current.restartSession(true));

    rerender({ title: 'Other', subtitleKey: 'subtitles', target: { kind: 'movie', mediaId: 8 } });
    expect(result.current.pictureHeld).toBe(false);
    expect(result.current.session).toBeNull();
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
    expect(result.current.error).toContain('None of the sources for “Film” could be played');
    expect(result.current.session).toBeNull();
  });

  it('plays the source the viewer chose, in its language, until it fails', async () => {
    createSession
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(1)) })
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(5)) })
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(sessionFor(2)) });
    const { result } = renderSource(handlers);
    await waitFor(() => expect(result.current.session?.source.id).toBe(1));

    act(() => result.current.chooseSource(5, 'lt'));
    // The current session plays on while the chosen one is requested
    expect(result.current.pictureHeld).toBe(true);
    await waitFor(() => expect(result.current.session?.source.id).toBe(5));
    const request = createSession.mock.lastCall?.[0];
    expect(request).toMatchObject({ sourceId: 5 });
    expect(request.preferences.audioLanguages[0]).toBe('lt');

    act(() => result.current.handleMediaError());
    await waitFor(() => expect(result.current.session?.source.id).toBe(2));
    expect(createSession.mock.lastCall?.[0]).not.toHaveProperty('sourceId');
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
