import type { CreatePlaybackSessionResponse, ProgressEntry } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren, type ReactElement, StrictMode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createSession,
  updateProgress,
  resumeEntry,
  startAudioPlayback,
  stopAudioPlayback,
  searchSubtitles,
} = vi.hoisted(() => ({
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
vi.mock('@features/player/lib/audio-playback', () => ({ startAudioPlayback }));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => resumeEntry.current,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
  useUpdateProgressMutation: () => [updateProgress],
}));
vi.mock('@features/realtime/realtime.middleware', () => ({
  saveProgressWithRealtime: (progress: unknown) => () => updateProgress(progress),
}));

import { describePlaybackFailure, getPlaybackStatusMessage } from './playback-copy';
import { PlayerView } from './PlayerView';

function render(ui: ReactElement) {
  const store = configureStore({ reducer: () => ({ auth: { currentUser: null } }) });
  function Wrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  }

  return rtlRender(ui, { wrapper: Wrapper });
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

describe('PlayerView', () => {
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

  it('reuses a single session during StrictMode effect replay', async () => {
    let resolve!: (value: CreatePlaybackSessionResponse) => void;
    const promise = new Promise<CreatePlaybackSessionResponse>(done => {
      resolve = done;
    });
    createSession.mockReturnValue({ unwrap: () => promise });
    render(
      <StrictMode>
        <PlayerView
          playable={playable}
          title="Strict movie"
          onBack={vi.fn()}
          nextEpisode={null}
          onPlayNext={vi.fn()}
        />
      </StrictMode>
    );
    expect(createSession).toHaveBeenCalledTimes(1);
    await act(async () => resolve(session));
    expect(await screen.findByLabelText('Strict movie')).toBeInTheDocument();
    expect(updateProgress).not.toHaveBeenCalled();
  });

  it('saves the old playback snapshot when changing targets and when leaving', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    const view = render(
      <PlayerView
        playable={playable}
        title="First movie"
        onBack={vi.fn()}
        nextEpisode={null}
        onPlayNext={vi.fn()}
      />
    );
    const video = (await screen.findByLabelText('First movie')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    video.currentTime = 25;
    fireEvent.timeUpdate(video);
    const nextPlayable = { kind: 'movie' as const, mediaId: 124 };
    view.rerender(
      <PlayerView
        playable={nextPlayable}
        title="Next movie"
        onBack={vi.fn()}
        nextEpisode={null}
        onPlayNext={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(updateProgress).toHaveBeenCalledWith({
        playable,
        positionSeconds: 25,
        durationSeconds: 100,
        state: 'paused',
      })
    );
    const nextVideo = (await screen.findByLabelText('Next movie')) as HTMLVideoElement;
    Object.defineProperty(nextVideo, 'duration', { configurable: true, value: 100 });
    nextVideo.currentTime = 40;
    fireEvent.timeUpdate(nextVideo);
    view.unmount();
    await waitFor(() =>
      expect(updateProgress).toHaveBeenCalledWith({
        playable: nextPlayable,
        positionSeconds: 40,
        durationSeconds: 100,
        state: 'paused',
      })
    );
  });

  it('sends device codecs and preferred languages before a video element is mounted', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    render(<PlayerView playable={playable} title="Movie" onBack={vi.fn()} />);
    await screen.findByLabelText('Movie');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          audioLanguages: [...navigator.languages],
          supportedAudioCodecs: expect.any(Array),
          nativeAudioTracks: expect.any(Boolean),
        }),
      })
    );
  });

  it('explains an unavailable source with the title and a recovery action', async () => {
    createSession.mockReturnValue({
      unwrap: () => Promise.reject({ status: 404, data: 'No playable source available' }),
    });

    render(<PlayerView playable={playable} title="Toy Story 5" onBack={vi.fn()} />);

    expect(screen.getByText('Preparing “Toy Story 5” for playback…')).toBeInTheDocument();
    expect(
      await screen.findByText(/No playable source is available for “Toy Story 5” yet/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries source preparation and reports when the selected source is ready', async () => {
    createSession
      .mockReturnValueOnce({
        unwrap: () => Promise.reject({ status: 500, data: 'Internal server error' }),
      })
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(session) });

    render(<PlayerView playable={playable} title="The Shawshank Redemption" onBack={vi.fn()} />);

    await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('Ready to play “The Shawshank Redemption”.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('The Shawshank Redemption')).toBeInTheDocument();
  });

  it('keeps Back available during playback and uses the paw controls', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    const onBack = vi.fn();
    render(<PlayerView playable={playable} title="Toy Story 5" onBack={onBack} />);
    const video = await screen.findByLabelText('Toy Story 5');
    expect(video).not.toHaveAttribute('controls');
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
    expect(screen.getByAltText('Miauflix logo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to details/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('seeks and mutes the current video through the custom controls', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    render(<PlayerView playable={playable} title="Toy Story 5" onBack={vi.fn()} />);
    const video = (await screen.findByLabelText('Toy Story 5')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    fireEvent.durationChange(video);
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '45' } });
    expect(video.currentTime).toBe(45);
    expect(screen.getByText('Preparing playback…')).toBeInTheDocument();
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    fireEvent.loadedData(video);
    fireEvent.timeUpdate(video);
    expect(screen.getByText('00:45 / 02:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(video.muted).toBe(true);
    fireEvent.volumeChange(video);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });

  it('hides the header with the controls and reveals both on pointer movement', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    const view = render(<PlayerView playable={playable} title="Toy Story 5" onBack={vi.fn()} />);
    const video = await screen.findByLabelText('Toy Story 5');
    vi.useFakeTimers();
    try {
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      fireEvent.play(video);
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByRole('banner', { hidden: true })).not.toBeVisible();
      expect(screen.getByAltText('Miauflix logo')).not.toBeVisible();
      expect(screen.queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument();
      fireEvent.pointerMove(screen.getByLabelText('Playback controls'));
      expect(screen.getByRole('button', { name: /Back to details/ })).toBeVisible();
      expect(screen.getByAltText('Miauflix logo')).toBeVisible();
      expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('resumes imported percentage progress against the actual video duration', async () => {
    resumeEntry.current = {
      playable,
      state: 'paused',
      positionSeconds: 50,
      durationSeconds: 100,
      updatedAt: '2026-10-04T10:00:00Z',
    };
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    render(<PlayerView playable={playable} title="Toy Story 5" onBack={vi.fn()} />);
    const video = (await screen.findByLabelText('Toy Story 5')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 200 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(100);
    fireEvent.playing(video);
    expect(updateProgress).toHaveBeenLastCalledWith({
      playable,
      state: 'playing',
      positionSeconds: 100,
      durationSeconds: 200,
    });
  });

  it('does not report playing heartbeats while paused and reports completion once', async () => {
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    const view = render(<PlayerView playable={playable} title="Toy Story 5" onBack={vi.fn()} />);
    const video = (await screen.findByLabelText('Toy Story 5')) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 200 });
    video.currentTime = 50;
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    fireEvent.loadedMetadata(video);
    fireEvent.pause(video);
    vi.useFakeTimers();
    try {
      act(() => vi.advanceTimersByTime(20_000));
      expect(updateProgress).toHaveBeenCalledTimes(1);
      expect(updateProgress).toHaveBeenLastCalledWith({
        playable,
        state: 'paused',
        positionSeconds: 50,
        durationSeconds: 200,
      });
      video.currentTime = 200;
      fireEvent.ended(video);
      act(() => vi.advanceTimersByTime(20_000));
      view.unmount();
      expect(updateProgress).toHaveBeenCalledTimes(2);
      expect(updateProgress).toHaveBeenLastCalledWith({
        playable,
        state: 'completed',
        positionSeconds: 200,
        durationSeconds: 200,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates a cold session when the browser can play the source', async () => {
    createSession.mockReturnValue({
      unwrap: () =>
        Promise.resolve({ ...session, preparation: { ...session.preparation, state: 'cold' } }),
    });
    render(<PlayerView playable={playable} title="Toy Story 5" onBack={vi.fn()} />);

    const video = await screen.findByLabelText('Toy Story 5');
    expect(screen.getByText('Preparing “Toy Story 5” for playback…')).toBeInTheDocument();
    fireEvent.canPlay(video);
    expect(screen.getByText('Ready to play “Toy Story 5”.')).toBeInTheDocument();
  });

  it('resumes converted audio on the full movie timeline and reports original progress', async () => {
    resumeEntry.current = {
      playable,
      state: 'paused',
      positionSeconds: 50,
      durationSeconds: 100,
      updatedAt: '2026-10-07T10:00:00Z',
    };
    createSession.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          ...session,
          streamUrl: '/api/stream/key/audio',
          delivery: {
            mode: 'audio-transcode',
            audioCodec: 'ac3',
            durationSeconds: 200,
            mimeType: 'video/mp4',
          },
        }),
    });
    render(<PlayerView playable={playable} title="Audio fixture" onBack={vi.fn()} />);
    const video = (await screen.findByLabelText('Audio fixture')) as HTMLVideoElement;
    await waitFor(() => expect(startAudioPlayback).toHaveBeenCalled());
    expect(startAudioPlayback.mock.lastCall?.[0]).toMatchObject({
      startSeconds: 100,
      durationSeconds: 200,
    });
    video.currentTime = 105;
    act(() => startAudioPlayback.mock.lastCall?.[0].onReady());
    fireEvent.playing(video);
    expect(updateProgress).toHaveBeenLastCalledWith({
      playable,
      state: 'playing',
      positionSeconds: 105,
      durationSeconds: 200,
    });
  });

  it('switches source audio language at the current position without changing playback intent', async () => {
    createSession.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          ...session,
          delivery: {
            mode: 'audio-transcode',
            audioCodec: 'ac3',
            durationSeconds: 120,
            mimeType: 'video/mp4',
            defaultAudioTrackIndex: 0,
            audioTracks: [
              {
                index: 0,
                language: 'fra',
                title: null,
                codec: 'ac3',
                channels: 6,
                isDefault: true,
              },
              {
                index: 1,
                language: 'eng',
                title: null,
                codec: 'ac3',
                channels: 6,
                isDefault: false,
              },
            ],
          },
        }),
    });
    render(<PlayerView playable={playable} title="Languages" onBack={vi.fn()} />);
    const video = (await screen.findByLabelText('Languages')) as HTMLVideoElement;
    video.currentTime = 45;
    act(() => startAudioPlayback.mock.lastCall?.[0].onReady());
    fireEvent.timeUpdate(video);
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles' }));
    expect(screen.getByRole('button', { name: /French.*AC3/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /English.*AC3/ }));
    expect(startAudioPlayback.mock.lastCall?.[0]).toMatchObject({
      startSeconds: 45,
      audioTrackIndex: 1,
      autoplay: false,
    });
    video.currentTime = 0;
    fireEvent.timeUpdate(video);
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('45');
  });

  it.each(['embedded', 'torrent'] as const)(
    'offers %s subtitles without provider setup and loads them on the media clock',
    async provider => {
      createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
      searchSubtitles.mockReturnValue({
        unwrap: () =>
          Promise.resolve({
            configured: false,
            available: true,
            candidates: [
              {
                id: 'local-candidate',
                provider,
                fileId: `9:${provider}:2`,
                language: 'en',
                languageLabel: 'English',
                release: 'Local English',
                hearingImpaired: false,
                trusted: false,
                match: 'file',
                filenameSimilarity: null,
              },
            ],
          }),
      });
      const prototype = window.HTMLTrackElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'track');
      Object.defineProperty(prototype, 'track', {
        configurable: true,
        get: () => ({ mode: 'disabled', cues: [] }),
      });
      try {
        const view = render(
          <PlayerView playable={playable} title="Local subtitles" onBack={vi.fn()} />
        );
        const video = (await screen.findByLabelText('Local subtitles')) as HTMLVideoElement;
        await waitFor(() =>
          expect(searchSubtitles).toHaveBeenCalledWith(
            expect.objectContaining({ localOnly: true, refresh: false })
          )
        );
        fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }));
        fireEvent.click(await screen.findByRole('button', { name: /Local English/ }));
        expect(view.container.querySelector('track')?.getAttribute('src')).toContain(
          'local-candidate'
        );
        video.currentTime = 70;
        fireEvent.seeked(video);
        const src = view.container.querySelector('track')?.getAttribute('src');
        if (provider === 'embedded') expect(src).toContain('&start=60');
        else expect(src).not.toContain('?start=');
        expect(
          JSON.parse(window.localStorage.getItem('miauflix.media-subtitles.anonymous.m:123')!)
        ).toMatchObject({ selectedFileId: `9:${provider}:2` });
        view.unmount();
      } finally {
        if (descriptor) Object.defineProperty(prototype, 'track', descriptor);
        else Reflect.deleteProperty(prototype, 'track');
      }
    }
  );

  it('loads selected subtitles from the API route with their track enabled', async () => {
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
    const view = render(
      <PlayerView playable={playable} title="Subtitles fixture" onBack={vi.fn()} />
    );
    await screen.findByLabelText('Subtitles fixture');
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }));
    const search = await screen.findByRole('button', { name: /Find subtitles/ });
    await waitFor(() => expect(search).not.toBeDisabled());
    fireEvent.click(search);
    const select = await screen.findByRole('button', { name: /A long release/ });
    expect(screen.queryByText(/Filename match/)).not.toBeInTheDocument();
    const prototype = window.HTMLTrackElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'track');
    const textTrack = {
      mode: 'disabled',
      cues: [{ startTime: 10, endTime: 12, text: 'Preview word' }],
    };
    Object.defineProperty(prototype, 'track', { configurable: true, get: () => textTrack });
    try {
      fireEvent.click(select);
      const track = view.container.querySelector('track');
      expect(track?.getAttribute('src')).toMatch(
        /\/api\/subtitles\/tracks\/candidate-1\?streamingKey=streaming-key$/
      );
      expect(textTrack.mode).toBe('showing');
      fireEvent.load(track!);
      expect(textTrack.cues[0]).toMatchObject({
        snapToLines: false,
        line: 75,
        lineAlign: 'end',
      });
      fireEvent.click(screen.getByRole('button', { name: /Adjust subtitle timing/ }));
      expect(screen.getByText('Preview word')).toBeInTheDocument();
      expect(screen.getByLabelText('Now')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Subtitles 5 seconds later' }));
      expect(textTrack.cues[0].startTime).toBe(15);
      expect(textTrack.cues[0].endTime).toBe(17);
      expect(screen.getByText('Timing adjustment: +5s')).toBeInTheDocument();
      expect(
        JSON.parse(window.localStorage.getItem('miauflix.media-subtitles.anonymous.m:123')!)
      ).toMatchObject({
        selectedFileId: 42,
        offset: 5,
        language: 'en',
      });
      view.unmount();
    } finally {
      if (descriptor) Object.defineProperty(prototype, 'track', descriptor);
      else Reflect.deleteProperty(prototype, 'track');
    }
  });

  it('automatically restores a media subtitle list, selection and sync using stable candidate IDs', async () => {
    window.localStorage.setItem(
      'miauflix.media-subtitles.anonymous.m:123',
      JSON.stringify({
        language: 'en',
        hearingImpaired: false,
        selectedFileId: 42,
        offset: 10.25,
      })
    );
    createSession.mockReturnValue({ unwrap: () => Promise.resolve(session) });
    searchSubtitles.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          configured: true,
          available: true,
          candidates: [
            {
              id: 'fresh-candidate',
              fileId: 42,
              language: 'en',
              languageLabel: 'English',
              release: 'Remembered release',
              hearingImpaired: false,
              trusted: true,
              match: 'release',
            },
          ],
        }),
    });
    const prototype = window.HTMLTrackElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'track');
    Object.defineProperty(prototype, 'track', {
      configurable: true,
      get: () => ({ mode: 'disabled', cues: [] }),
    });
    try {
      const view = render(
        <PlayerView playable={playable} title="Remembered media" onBack={vi.fn()} />
      );
      await waitFor(() =>
        expect(view.container.querySelector('track')).toHaveAttribute(
          'src',
          expect.stringContaining('fresh-candidate')
        )
      );
      expect(searchSubtitles).toHaveBeenCalledWith({
        streamingKey: session.streamingKey,
        language: 'en',
        hearingImpaired: false,
        refresh: false,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }));
      expect(
        screen.getByRole('button', { name: 'Adjust subtitle timing (+10.25s)' })
      ).toBeInTheDocument();
      view.unmount();
    } finally {
      if (descriptor) Object.defineProperty(prototype, 'track', descriptor);
      else Reflect.deleteProperty(prototype, 'track');
    }
  });

  it('restores another media only after its own playback grant is created', async () => {
    window.localStorage.setItem(
      'miauflix.media-subtitles.anonymous.m:124',
      JSON.stringify({
        language: 'fr',
        hearingImpaired: false,
        selectedFileId: null,
        offset: 0,
      })
    );
    createSession
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(session) })
      .mockReturnValueOnce({
        unwrap: () => Promise.resolve({ ...session, streamingKey: 'second-media-key' }),
      });
    searchSubtitles.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          configured: true,
          available: true,
          candidates: [],
        }),
    });
    const view = render(<PlayerView playable={playable} title="First media" onBack={vi.fn()} />);
    await screen.findByLabelText('First media');
    view.rerender(
      <PlayerView
        playable={{ kind: 'movie', mediaId: 124 }}
        title="Second media"
        onBack={vi.fn()}
      />
    );
    await waitFor(() => expect(searchSubtitles).toHaveBeenCalledTimes(2));
    expect(searchSubtitles).toHaveBeenCalledWith({
      streamingKey: 'second-media-key',
      language: 'fr',
      hearingImpaired: false,
      refresh: false,
    });
  });

  it('cancels conversion on seeks and keeps playback intent across rapid seeks', async () => {
    createSession.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          ...session,
          delivery: {
            mode: 'audio-transcode',
            audioCodec: 'ac3',
            durationSeconds: 120,
            mimeType: 'video/mp4',
          },
        }),
    });
    const view = render(<PlayerView playable={playable} title="Audio fixture" onBack={vi.fn()} />);
    const video = (await screen.findByLabelText('Audio fixture')) as HTMLVideoElement;
    await waitFor(() => expect(startAudioPlayback).toHaveBeenCalled());
    act(() => startAudioPlayback.mock.lastCall?.[0].onReady());
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '45' } });
    expect(stopAudioPlayback).toHaveBeenCalledTimes(1);
    expect(startAudioPlayback.mock.lastCall?.[0]).toMatchObject({
      startSeconds: 45,
      autoplay: true,
    });
    video.currentTime = 0;
    fireEvent.timeUpdate(video);
    fireEvent.durationChange(video);
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('45');
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    fireEvent.pause(video);
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('45');
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '90' } });
    expect(startAudioPlayback.mock.lastCall?.[0]).toMatchObject({
      startSeconds: 90,
      autoplay: true,
    });
    view.unmount();
    expect(stopAudioPlayback).toHaveBeenCalledTimes(3);
  });

  it('searches ahead at playback start and requests the next episode download at 70%', async () => {
    const nextEpisode = {
      playable: { kind: 'episode' as const, showMediaId: 9001, seasonNumber: 1, episodeNumber: 2 },
      title: 'Episode 2',
    };
    const nextSession = { ...session, streamingKey: 'next-key', streamUrl: '/api/stream/next-key' };
    createSession
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(session) })
      .mockReturnValue({ unwrap: () => Promise.resolve(nextSession) });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: { cancel: vi.fn() },
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(
        <PlayerView
          playable={playable}
          title="Episode 1"
          onBack={vi.fn()}
          nextEpisode={nextEpisode}
          onPlayNext={vi.fn()}
        />
      );
      const video = (await screen.findByLabelText('Episode 1')) as HTMLVideoElement;
      await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
      expect(createSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ playable: nextEpisode.playable, deferDownload: true })
      );

      Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
      video.currentTime = 69;
      fireEvent.timeUpdate(video);
      expect(fetchMock).not.toHaveBeenCalled();
      video.currentTime = 70;
      fireEvent.timeUpdate(video);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/stream/next-key/prefetch', {
          method: 'POST',
          cache: 'no-store',
        })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses a five-second chapter countdown and suppresses auto-next for combined files', async () => {
    const nextEpisode = {
      playable: { kind: 'episode' as const, showMediaId: 9001, seasonNumber: 1, episodeNumber: 2 },
      title: 'Episode 2',
    };
    const currentSession = {
      ...session,
      episodeMatchKind: 'single' as const,
      delivery: {
        mode: 'direct' as const,
        audioCodec: null,
        durationSeconds: 120,
        creditsStartSeconds: 80,
        mimeType: 'video/mp4',
      },
    };
    const nextSession = { ...session, streamingKey: 'next-key', streamUrl: '/api/stream/next-key' };
    createSession
      .mockReturnValueOnce({ unwrap: () => Promise.resolve(currentSession) })
      .mockReturnValue({ unwrap: () => Promise.resolve(nextSession) });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: { cancel: vi.fn() },
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const onPlayNext = vi.fn();
      const view = render(
        <PlayerView
          playable={playable}
          title="Episode 1"
          onBack={vi.fn()}
          nextEpisode={nextEpisode}
          onPlayNext={onPlayNext}
        />
      );
      const video = (await screen.findByLabelText('Episode 1')) as HTMLVideoElement;
      await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
      video.currentTime = 80;
      fireEvent.timeUpdate(video);
      expect(screen.getByRole('button', { name: 'Play next episode (5s)' })).toBeInTheDocument();
      video.currentTime = 85;
      fireEvent.timeUpdate(video);
      expect(onPlayNext).toHaveBeenCalledTimes(1);
      view.unmount();

      createSession.mockReset().mockReturnValue({
        unwrap: () => Promise.resolve({ ...currentSession, episodeMatchKind: 'combined' }),
      });
      const combinedView = render(
        <PlayerView
          playable={playable}
          title="Combined episode"
          onBack={vi.fn()}
          nextEpisode={nextEpisode}
          onPlayNext={onPlayNext}
        />
      );
      const combinedVideo = (await screen.findByLabelText('Combined episode')) as HTMLVideoElement;
      combinedVideo.currentTime = 115;
      fireEvent.timeUpdate(combinedVideo);
      expect(screen.queryByRole('button', { name: /Play next episode/ })).not.toBeInTheDocument();
      expect(onPlayNext).toHaveBeenCalledTimes(1);
      combinedView.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('playback status copy', () => {
  it('keeps transient and failure states actionable', () => {
    expect(
      describePlaybackFailure(
        { status: 422, data: 'Audio conversion requires an H.264 video source.' },
        'Coyote vs. Acme'
      )
    ).toContain('Audio conversion requires an H.264 video source.');
    expect(getPlaybackStatusMessage('preparing', 'Toy Story 5')).toBe(
      'Preparing “Toy Story 5” for playback…'
    );
    expect(describePlaybackFailure({ status: 429 }, 'Toy Story 5')).toContain('Wait a moment');
    expect(
      describePlaybackFailure(
        { status: 500, data: 'Source metadata could not be resolved' },
        'Toy Story 5'
      )
    ).toContain('could not be prepared');
    expect(
      describePlaybackFailure(
        { status: 500, data: 'database details must stay hidden' },
        'Toy Story 5'
      )
    ).not.toContain('database details');
    expect(describePlaybackFailure(new Error('Failed to start playback'), 'Toy Story 5')).toContain(
      'Retry'
    );
  });
});
