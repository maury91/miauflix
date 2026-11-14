import type { CreatePlaybackSessionResponse, ProgressEntry } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren, type ReactElement } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AVPlay, AVPlayListeners, TrackInfo } from '@/types/tizen';

const {
  createSession,
  updateProgress,
  resumeEntry,
  startAudioPlayback,
  stopAudioPlayback,
  searchSubtitles,
  requestAvailability,
} = vi.hoisted(() => ({
  requestAvailability: vi.fn(),
  searchSubtitles: vi.fn(),
  createSession: vi.fn(),
  updateProgress: vi.fn(),
  resumeEntry: { current: undefined as ProgressEntry | undefined },
  startAudioPlayback: vi.fn(),
  stopAudioPlayback: vi.fn(),
}));

vi.mock('@features/player/api/playback.api', async () => {
  const React = await import('react');
  return {
    useCreateSessionMutation: () => {
      const [result, setResult] = React.useState<{ data?: CreatePlaybackSessionResponse }>({});
      const [requestVersion, setRequestVersion] = React.useState(0);
      const reset = React.useCallback(() => {
        setResult({});
        setRequestVersion(requestVersion + 1);
      }, [requestVersion]);
      const trigger = React.useCallback((request: unknown) => {
        const response = createSession(request);
        setResult({});
        setRequestVersion(version => version + 1);
        const requestPromise = response.unwrap().then(
          (data: CreatePlaybackSessionResponse) => {
            setResult({ data });
            return data;
          },
          (error: unknown) => {
            setResult({});
            throw error;
          }
        );
        return { unwrap: () => requestPromise };
      }, []);
      return [trigger, { ...result, reset }] as const;
    },
    useSearchSubtitlesMutation: () => [searchSubtitles],
  };
});
vi.mock('@features/notifications/api/notifications.api', async () => {
  const React = await import('react');
  return {
    useRequestAvailabilityMutation: () => {
      const [state, setState] = React.useState({
        isLoading: false,
        isSuccess: false,
        isError: false,
      });
      const trigger = React.useCallback((playable: unknown) => {
        requestAvailability(playable);
        setState({ isLoading: false, isSuccess: true, isError: false });
      }, []);
      return [trigger, state] as const;
    },
  };
});
vi.mock('@features/player/lib/audio-playback', () => ({ startAudioPlayback }));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => resumeEntry.current,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
  useUpdateProgressMutation: () => [updateProgress],
}));
vi.mock('@features/realtime/realtime.middleware', () => ({
  saveProgressWithRealtime: (progress: unknown) => () => updateProgress(progress),
}));

vi.mock('@shared/config/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('@shared/config/constants')>()),
  builtForTizen: true,
  API_CREDENTIALS: 'omit',
  API_URL: 'https://miauflix.example',
}));

import { realtimeActions, realtimeSlice } from '@store/slices/realtime';

import { PlayerView } from './PlayerView';

function render(ui: ReactElement) {
  const store = configureStore({
    reducer: { auth: () => ({ currentUser: null }), realtime: realtimeSlice.reducer },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  }

  return { ...rtlRender(ui, { wrapper: Wrapper }), store };
}

const playable = { kind: 'movie' as const, mediaId: 123 };
const session: CreatePlaybackSessionResponse = {
  playbackId: 'playback-1',
  streamingKey: 'streaming-key',
  streamUrl: '/api/stream/streaming-key',
  source: {
    id: 9,
    quality: null,
    size: 100,
    videoCodec: null,
    broadcasters: null,
    watchers: null,
  },
  preparation: {
    state: 'warm',
    verifiedBytes: 100,
    allocatedBytes: 100,
  },
  expiresAt: new Date().toISOString(),
};

function fakeAvplay() {
  let listener: AVPlayListeners = {};
  const avplay = {
    open: vi.fn(),
    close: vi.fn(),
    stop: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    suspend: vi.fn(),
    restore: vi.fn(),
    prepareAsync: vi.fn((onSuccess?: () => void) => onSuccess?.()),
    seekTo: vi.fn((_milliseconds: number, onSuccess?: () => void) => onSuccess?.()),
    getState: vi.fn(() => 'READY' as const),
    getDuration: vi.fn(() => 120_000),
    getCurrentTime: vi.fn(() => 0),
    setDisplayRect: vi.fn(),
    setDisplayMethod: vi.fn(),
    setListener: vi.fn((value: AVPlayListeners) => {
      listener = value;
    }),
    setStreamingProperty: vi.fn(),
    getTotalTrackInfo: vi.fn((): TrackInfo[] => [{ type: 'AUDIO', index: 1, extra_info: '' }]),
    setSelectTrack: vi.fn(),
  } satisfies AVPlay;
  return { avplay, listener: () => listener };
}

describe('PlayerView on a Samsung TV', () => {
  beforeEach(() => {
    window.localStorage.clear();
    createSession.mockReset();
    updateProgress.mockReset();
    searchSubtitles.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ configured: false, available: false, candidates: [] }),
    });
    resumeEntry.current = undefined;
    startAudioPlayback.mockReset().mockReturnValue(stopAudioPlayback);
    stopAudioPlayback.mockReset();
  });

  afterEach(() => {
    delete window.webapis;
    vi.unstubAllGlobals();
  });

  it('plays the stream through AVPlay and asks for what AVPlay decodes', async () => {
    const { avplay } = fakeAvplay();
    window.webapis = { avplay };
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    const view = render(<PlayerView playable={playable} title="Movie" onBack={vi.fn()} />);

    await screen.findByLabelText('Movie');
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          allowHevc: true,
          nativeHevcContainers: ['mp4', 'matroska'],
          supportedAudioCodecs: ['aac', 'mp3', 'ac3', 'eac3', 'flac'],
          nativeAudioTracks: true,
        }),
      })
    );
    await waitFor(() =>
      expect(avplay.open).toHaveBeenCalledWith('https://miauflix.example/api/stream/streaming-key')
    );
    expect(avplay.play).toHaveBeenCalled();
    expect(view.container.querySelector('object[type="application/avplayer"]')).not.toBeNull();
    expect(view.container.querySelector('video')).toBeNull();

    view.unmount();
    expect(avplay.close).toHaveBeenCalled();
  });

  it('draws the selected subtitles over AVPlay and keeps manual sync', async () => {
    const { avplay, listener } = fakeAvplay();
    window.webapis = { avplay };
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('WEBVTT\n\n00:00:10.000 --> 00:00:12.000\nPreview word\n', { status: 200 })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    searchSubtitles.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          configured: true,
          available: true,
          candidates: [
            {
              id: 'candidate-1',
              fileId: 42,
              language: 'en',
              languageLabel: 'English',
              release: 'A long release',
              filenameSimilarity: 94,
              hearingImpaired: false,
              trusted: true,
              match: 'file',
            },
          ],
        }),
    });
    render(<PlayerView playable={playable} title="Subtitles fixture" onBack={vi.fn()} />);
    await screen.findByLabelText('Subtitles fixture');
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }));
    const search = await screen.findByRole('button', { name: /Find subtitles/ });
    await waitFor(() => expect(search).not.toBeDisabled());
    fireEvent.click(search);
    fireEvent.click(await screen.findByRole('button', { name: /A long release/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'https://miauflix.example/api/subtitles/tracks/candidate-1?streamingKey=streaming-key',
        expect.objectContaining({ credentials: 'omit' })
      )
    );
    act(() => listener().oncurrentplaytime?.(10_500));
    expect(await screen.findByTestId('avplay-caption')).toHaveTextContent('Preview word');

    fireEvent.click(screen.getByRole('button', { name: /Adjust subtitle timing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles 5 seconds later' }));
    expect(screen.queryByTestId('avplay-caption')).toBeNull();
    expect(screen.getByText('Timing adjustment: +5s')).toBeInTheDocument();
  });

  it('plays converted audio in a video element', async () => {
    const { avplay } = fakeAvplay();
    window.webapis = { avplay };
    createSession.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          ...session,
          streamUrl: '/api/stream/streaming-key/audio',
          delivery: {
            mode: 'audio-transcode',
            videoCodec: 'h264',
            audioCodec: 'dts',
            durationSeconds: 120,
            mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
            audioTracks: [],
            defaultAudioTrackIndex: 0,
          },
        }),
    });
    const view = render(<PlayerView playable={playable} title="Movie" onBack={vi.fn()} />);
    await waitFor(() => expect(startAudioPlayback).toHaveBeenCalled());
    expect(startAudioPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://miauflix.example/api/stream/streaming-key/audio' })
    );
    expect(view.container.querySelector('video')).not.toBeNull();
    expect(avplay.open).not.toHaveBeenCalled();
  });

  it('opens a TV version at the saved position', async () => {
    const { avplay } = fakeAvplay();
    window.webapis = { avplay };
    resumeEntry.current = {
      playable,
      state: 'paused',
      positionSeconds: 1200.7,
      durationSeconds: 3540,
      updatedAt: '2026-11-13T10:00:00Z',
    };
    createSession.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          ...session,
          streamUrl: '/api/stream/streaming-key/remux/index.m3u8',
          delivery: {
            mode: 'remux',
            audioCodec: 'ac3',
            durationSeconds: 3540,
            mimeType: 'application/vnd.apple.mpegurl',
            audioTracks: [],
            defaultAudioTrackIndex: 0,
          },
        }),
    });
    render(<PlayerView playable={playable} title="Movie" onBack={vi.fn()} />);
    await waitFor(() =>
      expect(avplay.open).toHaveBeenCalledWith(
        'https://miauflix.example/api/stream/streaming-key/remux/index.m3u8?start=1200'
      )
    );
  });

  it('holds the converted picture until the TV version plays from the same position', async () => {
    const { avplay } = fakeAvplay();
    let prepared: (() => void) | undefined;
    avplay.prepareAsync.mockImplementation((onSuccess?: () => void) => {
      prepared = onSuccess;
    });
    // A TV version still being built: AVPlay plays it as a live stream, with no length.
    avplay.getDuration.mockReturnValue(0);
    window.webapis = { avplay };
    const converting = {
      ...session,
      streamUrl: '/api/stream/streaming-key/audio',
      delivery: {
        mode: 'audio-transcode',
        videoCodec: 'hevc',
        audioCodec: 'truehd',
        durationSeconds: 3540,
        mimeType: 'video/mp4; codecs="hvc1.2.4.L120.B0, mp4a.40.2"',
        audioTracks: [],
        defaultAudioTrackIndex: 0,
      },
    } as CreatePlaybackSessionResponse;
    let created: ((value: CreatePlaybackSessionResponse) => void) | undefined;
    createSession
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(converting) })
      .mockReturnValueOnce({
        unwrap: () => new Promise<CreatePlaybackSessionResponse>(resolve => (created = resolve)),
      });
    const view = render(<PlayerView playable={playable} title="Movie" onBack={vi.fn()} />);
    await waitFor(() => expect(startAudioPlayback).toHaveBeenCalled());
    const video = view.container.querySelector('video')!;
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 851.5 });

    act(() => {
      view.store.dispatch(
        realtimeActions.playbackDeliveryReceived({
          type: 'playback-delivery',
          playbackId: session.playbackId,
          update: { type: 'recreate', reason: 'A TV version of this file is ready.' },
        })
      );
    });
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
    // The converted stream plays on while the new session is requested.
    expect(view.container.querySelector('video')).toBe(video);
    expect(stopAudioPlayback).not.toHaveBeenCalled();

    await act(async () => {
      created?.({
        ...session,
        playbackId: 'playback-2',
        streamUrl: '/api/stream/streaming-key-2/remux/index.m3u8',
        delivery: {
          mode: 'remux',
          audioCodec: 'ac3',
          durationSeconds: 3540,
          mimeType: 'application/vnd.apple.mpegurl',
          audioTracks: [],
          defaultAudioTrackIndex: 0,
        },
      } as CreatePlaybackSessionResponse);
    });
    await waitFor(() =>
      expect(avplay.open).toHaveBeenCalledWith(
        'https://miauflix.example/api/stream/streaming-key-2/remux/index.m3u8?start=851'
      )
    );
    // Converted audio stopped, its last frame still on screen above AVPlay.
    expect(stopAudioPlayback).toHaveBeenCalledWith({ keepPicture: true });
    expect(view.container.querySelector('video')).toBe(video);
    // AVPlay opens where the converted stream got to: seeked before it prepares.
    expect(avplay.seekTo).toHaveBeenCalledTimes(1);
    expect(avplay.seekTo).toHaveBeenCalledWith(851_500);
    expect(avplay.prepareAsync.mock.invocationCallOrder[0]).toBeGreaterThan(
      avplay.seekTo.mock.invocationCallOrder[0]
    );
    expect(avplay.play).not.toHaveBeenCalled();

    // Prepared there, it plays at once: no second seek.
    act(() => prepared?.());
    expect(avplay.seekTo).toHaveBeenCalledTimes(1);
    expect(avplay.play).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.container.querySelector('video')).toBeNull());
  });
});
