import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { IconButtonGroup } from '../../icon-button-group/IconButtonGroup';
import { InitialFocus, NavigationStage } from '../../storyHelpers';
import { storyImage } from '../../storyImage';
import { PlaybackToolbar } from './PlaybackToolbar';
import { SeekControl } from './SeekControl';
import { piecesToRanges } from './seekRanges';

import ForwardIcon from '~icons/mdi/fast-forward-10';
import FullscreenIcon from '~icons/mdi/fullscreen';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';
import BackIcon from '~icons/mdi/rewind-10';
import SubtitlesIcon from '~icons/mdi/subtitles-outline';

const meta = {
  title: 'Design System/Product Patterns/PlaybackToolbar',
  tags: ['autodocs'],
  component: PlaybackToolbar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The player’s controls over the video, on `overMedia`: title and episode, the SeekControl, then the main controls (an IconButtonGroup with its shared description) at the start and the secondary ones (audio and subtitle Popovers with OptionLists, full screen) at the end. The seek bar is a brand-red Slider with the downloaded blocks of the playing file under the watched fill; Left/Right seek by 10 s and clamp, Up/Down leave it. Hidden controls fade out and take no pointer. Composition only: the player adapter owns playback, visibility timing and the downloaded data (`piecesToRanges` turns a piece bitfield into blocks).',
      },
    },
  },
  args: { label: 'Playback controls', seek: null },
} satisfies Meta<typeof PlaybackToolbar>;

export default meta;
type Story = StoryObj<typeof PlaybackToolbar>;

const DURATION = 2 * 60 * 60 + 46 * 60;
// A file downloaded at the start, a stretch in the middle and a few scattered pieces
const pieces = Array.from({ length: 400 }, (_, index) =>
  index < 140 || (index > 220 && index < 260) || index % 37 === 0 ? 1 : 0
);
const downloaded = piecesToRanges(pieces);

const clock = (seconds: number) => {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = String(Math.floor((whole % 3600) / 60)).padStart(2, '0');
  const rest = String(whole % 60).padStart(2, '0');
  return `${hours}:${minutes}:${rest}`;
};

function Player() {
  const [position, setPosition] = useState(45 * 60);
  const [playing, setPlaying] = useState(true);
  const seekBy = (delta: number) =>
    setPosition(current => Math.min(DURATION, Math.max(0, current + delta)));
  return (
    <NavigationStage>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          minHeight: '28rem',
          background: `url("${storyImage('#3d405b', '#0b132b')}") center / cover`,
        }}
      >
        <PlaybackToolbar
          label="Playback controls"
          title="Dune: Part Two"
          subtitle="2024 · 2 h 46 min"
          navId="toolbar"
          seek={
            <SeekControl
              navId="seek"
              label="Seek"
              position={position}
              duration={DURATION}
              onSeek={setPosition}
              valueText={`${clock(position)} of ${clock(DURATION)}`}
              elapsedText={clock(position)}
              remainingText={`-${clock(DURATION - position)}`}
              downloaded={downloaded}
            />
          }
          start={
            <IconButtonGroup
              navId="main"
              label="Playback"
              items={[
                {
                  id: 'back',
                  label: 'Back 10 seconds',
                  icon: <BackIcon />,
                  onClick: () => seekBy(-10),
                },
                {
                  id: 'play',
                  label: playing ? 'Pause' : 'Play',
                  icon: playing ? <PauseIcon /> : <PlayIcon />,
                  onClick: () => setPlaying(value => !value),
                },
                {
                  id: 'forward',
                  label: 'Forward 10 seconds',
                  icon: <ForwardIcon />,
                  onClick: () => seekBy(10),
                },
              ]}
            />
          }
          end={
            <IconButtonGroup
              navId="more"
              label="More"
              items={[
                { id: 'subtitles', label: 'Subtitles', icon: <SubtitlesIcon /> },
                { id: 'fullscreen', label: 'Full screen', icon: <FullscreenIcon /> },
              ]}
            />
          }
        />
      </div>
      <InitialFocus id="main:play" />
    </NavigationStage>
  );
}

export const Controls: Story = {
  render: () => <Player />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const seek = canvas.getByRole('slider', { name: 'Seek' });
    await expect(canvas.getByRole('button', { name: 'Pause' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    // Up reaches the seek bar, which owns Left/Right: 10 s a press
    await userEvent.keyboard('{ArrowUp}');
    await expect(seek).toHaveAttribute('aria-valuetext', '0:45:00 of 2:46:00');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(seek).toHaveAttribute('aria-valuetext', '0:45:20 of 2:46:00');
    // Down leaves it for the controls row, entered at the remembered button
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('button', { name: 'Play' })).toHaveAttribute('data-focused');
    // The downloaded blocks are drawn as merged ranges
    await expect(downloaded.length).toBeLessThan(20);
  },
};
