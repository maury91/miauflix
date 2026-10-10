import type { CreatePlaybackSessionResponse, ProgressEntry } from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSession, updateProgress, resumeEntry } = vi.hoisted(() => ({
  createSession: vi.fn(),
  updateProgress: vi.fn(),
  resumeEntry: { current: undefined as ProgressEntry | undefined },
}));

vi.mock('@features/player/api/playback.api', () => ({
  useCreateSessionMutation: () => [createSession],
}));
vi.mock('@features/progress/api/progress.api', () => ({
  progressForPlayable: () => resumeEntry.current,
  useGetProgressQuery: () => ({ data: { progress: [] } }),
  useUpdateProgressMutation: () => [updateProgress],
}));

import { describePlaybackFailure, getPlaybackStatusMessage } from './playback-copy';
import { PlayerView } from './PlayerView';

function render(ui: ReactElement) {
  const store = configureStore({ reducer: () => ({}) });
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
    createSession.mockReset();
    updateProgress.mockReset();
    resumeEntry.current = undefined;
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
});

describe('playback status copy', () => {
  it('keeps transient and failure states actionable', () => {
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
