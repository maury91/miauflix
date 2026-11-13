import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SubtitleTiming, type SubtitleTimingCue } from './SubtitleTiming';

const cues: SubtitleTimingCue[] = [
  { start: 8, end: 10, text: 'First word' },
  { start: 12, end: 14, text: 'Second word' },
  { start: 20, end: 22, text: 'Third word' },
  { start: 30, end: 34, text: 'Fourth word' },
  { start: 40, end: 42, text: 'Fifth word' },
];
const setupTest = (currentTime = 12.5) => {
  const video = document.createElement('video');
  video.currentTime = currentTime;
  const videoRef = { current: video };
  function Fixture() {
    const [offset, setOffset] = useState(0);
    return (
      <SubtitleTiming cues={cues} videoRef={videoRef} offset={offset} onOffsetChange={setOffset} />
    );
  }
  return { video, ...render(<Fixture />) };
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('subtitle synchronization', () => {
  it('shows three neighbors with the active cue aligned to the fixed Now arrow', () => {
    setupTest();
    expect(screen.getByLabelText('Now')).toBeInTheDocument();
    expect(screen.getByText('First word')).toBeInTheDocument();
    expect(screen.getByText('Second word')).toHaveAttribute('data-current', 'true');
    expect(screen.getByText('Third word')).toBeInTheDocument();
    expect(screen.queryByText('Fourth word')).not.toBeInTheDocument();
  });

  it('extends coarse adjustment beyond five seconds without losing slider precision', () => {
    setupTest();
    const plus = screen.getByRole('button', { name: 'Subtitles 5 seconds later' });
    fireEvent.click(plus);
    fireEvent.click(plus);
    const slider = screen.getByRole('slider', { name: 'Subtitle timing adjustment' });
    expect(slider).toHaveValue('10');
    expect(slider).toHaveAttribute('min', '-5');
    expect(slider).toHaveAttribute('max', '15');
    expect(slider).toHaveAttribute('step', '0.25');
    expect(screen.getByText('Timing adjustment: +10s')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '10.25' } });
    expect(screen.getByText('Timing adjustment: +10.25s')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles 5 seconds earlier' }));
    expect(slider).toHaveValue('5.25');
  });

  it('extends the negative range and replaces cue neighbors as the slider moves', () => {
    setupTest(32);
    expect(screen.getByText('Fourth word')).toHaveAttribute('data-current', 'true');
    const slider = screen.getByRole('slider', { name: 'Subtitle timing adjustment' });
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles 5 seconds earlier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles 5 seconds earlier' }));
    expect(slider).toHaveAttribute('min', '-15');
    expect(slider).toHaveValue('-10');
    const plus = screen.getByRole('button', { name: 'Subtitles 5 seconds later' });
    for (let click = 0; click < 6; click++) fireEvent.click(plus);
    expect(slider).toHaveValue('20');
    expect(screen.getByText('Second word')).toHaveAttribute('data-current', 'true');
    expect(screen.getByText('First word')).toBeInTheDocument();
    expect(screen.queryByText('Fourth word')).not.toBeInTheDocument();
  });

  it('tracks playback while open and cleans up the timer when closed', () => {
    vi.useFakeTimers();
    const { video, unmount } = setupTest();
    video.currentTime = 32;
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('Fourth word')).toHaveAttribute('data-current', 'true');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps original cue timestamps intact and aligns a word when paused', () => {
    const { video } = setupTest();
    fireEvent.change(screen.getByRole('slider', { name: 'Subtitle timing adjustment' }), {
      target: { value: '4.5' },
    });
    expect(screen.getByText('First word')).toHaveAttribute('data-current', 'true');
    expect(video.currentTime).toBe(12.5);
    expect(cues[0].start).toBe(8);
  });
});
