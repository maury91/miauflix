import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { FocusScope, NavigationProvider } from '@shared/navigation';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerControls } from './PlayerControls';

function Player({
  seekPreview,
  onBack = () => undefined,
  onSeek,
}: {
  seekPreview: 'strip' | 'hover';
  onBack?: () => void;
  onSeek?: (position: number, play?: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Back leaves the player through an element scope, as in PlayerView
  const keyboardRef = useKeyboardNavigation({
    onBack: () => {
      onBack();
      return true;
    },
  });
  return (
    <main ref={keyboardRef}>
      <video ref={videoRef} aria-label="Fixture video" />
      <NavigationProvider>
        <FocusScope id="player">
          <PlayerControls
            videoRef={videoRef}
            durationSeconds={600}
            onBack={() => undefined}
            onSeek={onSeek}
            subtitleCandidates={[]}
            subtitleConfigured={false}
            subtitleAvailable={false}
            subtitleLoading={false}
            subtitleMessage=""
            selectedSubtitleId={null}
            subtitleOffset={0}
            onSearchSubtitles={() => undefined}
            onSelectSubtitle={() => undefined}
            onSubtitleOffsetChange={() => undefined}
            subtitlePreferencesKey={null}
            thumbnailSource="/api/stream/key"
            seekPreview={seekPreview}
          />
        </FocusScope>
      </NavigationProvider>
    </main>
  );
}

/** A playing video at `seconds`. */
const playingAt = (video: HTMLVideoElement, seconds: number) => {
  let paused = false;
  Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
  video.pause = vi.fn(() => {
    paused = true;
    fireEvent.pause(video);
  });
  video.play = vi.fn(() => {
    paused = false;
    fireEvent.play(video);
    return Promise.resolve();
  });
  video.currentTime = seconds;
  fireEvent.timeUpdate(video);
};

const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });
/** The moments the strip shows, from the thumbnails it asked for. */
const requested = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url]) =>
    Number(new URL(String(url), 'http://x').searchParams.get('t'))
  );

describe('PlayerControls seek preview', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
    fetchMock = vi.fn(() => Promise.resolve(new Response(new Blob(['jpeg']))));
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:frame');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('on the TV, pauses and steps along a strip of frames, seeking only on Confirm', async () => {
    render(<Player seekPreview="strip" />);
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 64);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('ArrowRight');
    expect(video.pause).toHaveBeenCalled();
    // Opened at the nearest moment that way, and nothing seeked yet
    expect(screen.getByText('01:10')).toBeInTheDocument();
    expect(video.currentTime).toBe(64);
    expect(screen.getByTestId('seek-thumbnail-strip').children).toHaveLength(5);
    await waitFor(() => expect(requested(fetchMock)).toEqual(expect.arrayContaining([70])));

    press('ArrowRight');
    press('ArrowRight');
    press('ArrowLeft');
    expect(screen.getByText('01:20')).toBeInTheDocument();
    expect(video.currentTime).toBe(64);

    press('Enter');
    // Closed, showing the chosen moment, before the seek (which blocks a TV) runs
    expect(screen.queryByTestId('seek-thumbnail-strip')).not.toBeInTheDocument();
    expect(screen.getByText('01:20')).toBeInTheDocument();
    expect(video.currentTime).toBe(64);
    await waitFor(() => expect(video.currentTime).toBe(80));
    expect(video.play).toHaveBeenCalled();
  });

  it('on the TV, Back closes the strip where the video was and plays on', () => {
    const onBack = vi.fn();
    render(<Player seekPreview="strip" onBack={onBack} />);
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 64);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('ArrowLeft');
    expect(screen.getByText('01:00')).toBeInTheDocument();
    press('ArrowLeft');
    press('Escape');

    expect(video.currentTime).toBe(64);
    expect(video.play).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByTestId('seek-thumbnail-strip')).not.toBeInTheDocument();
  });

  it('on the TV, Back with no strip open still leaves the player', () => {
    const onBack = vi.fn();
    render(<Player seekPreview="strip" onBack={onBack} />);
    playingAt(screen.getByLabelText('Fixture video') as HTMLVideoElement, 64);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('Escape');

    expect(onBack).toHaveBeenCalled();
  });

  it('on the TV, a strip opened before a chosen seek runs replaces it, starting from it', async () => {
    render(<Player seekPreview="strip" />);
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 64);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('ArrowRight');
    press('Enter');
    // Before the next paint runs the seek to 1:10
    press('ArrowRight');
    expect(screen.getByText('01:20')).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(video.currentTime).toBe(64);
    expect(video.play).not.toHaveBeenCalled();

    // Back still plays on: the replaced choice was going to
    press('Escape');
    expect(video.play).toHaveBeenCalled();
    expect(video.currentTime).toBe(64);
  });

  it('on the TV, keeps the video paused when playback starts while the strip is open', () => {
    render(<Player seekPreview="strip" />);
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 64);
    act(() => video.pause());
    act(() => screen.getByLabelText('Playback controls').focus());
    press('ArrowRight');
    vi.mocked(video.pause).mockClear();

    // Converted audio finishing its preparation autoplays
    act(() => void video.play());

    expect(video.pause).toHaveBeenCalled();
    expect(screen.getByTestId('seek-thumbnail-strip')).toBeInTheDocument();
    // Playback was asked for: Back plays on
    vi.mocked(video.play).mockClear();
    press('Escape');
    expect(video.play).toHaveBeenCalled();
  });

  it('loads thumbnails under StrictMode, whose effects run twice', async () => {
    render(
      <StrictMode>
        <Player seekPreview="strip" />
      </StrictMode>
    );
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 64);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('ArrowRight');

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('seek-thumbnail-strip').querySelector('img')).not.toBeNull()
    );
  });

  it('on the TV, seeks a converted stream once, asking it to play', async () => {
    const onSeek = vi.fn();
    render(<Player seekPreview="strip" onSeek={onSeek} />);
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 0);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    expect(onSeek).not.toHaveBeenCalled();
    press('Enter');

    await waitFor(() => expect(onSeek).toHaveBeenCalledTimes(1));
    expect(onSeek).toHaveBeenCalledWith(30, true);
  });

  it('on the web, keeps seeking at once with the keys and has no strip', () => {
    render(<Player seekPreview="hover" />);
    const video = screen.getByLabelText('Fixture video') as HTMLVideoElement;
    playingAt(video, 64);
    act(() => screen.getByLabelText('Playback controls').focus());

    press('ArrowRight');

    expect(video.currentTime).toBe(74);
    expect(video.pause).not.toHaveBeenCalled();
    expect(screen.queryByTestId('seek-thumbnail-strip')).not.toBeInTheDocument();
  });
});
