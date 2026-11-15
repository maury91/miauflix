import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import type { SurfaceContextValue } from '../surface';
import { useStoryVirtualRow } from '../useStoryVirtualFocus';
import { IconButton } from './IconButton';

import ClosedCaptionIcon from '~icons/mdi/closed-caption';
import ClosedCaptionOutlineIcon from '~icons/mdi/closed-caption-outline';
import CogIcon from '~icons/mdi/cog-outline';
import SkipForwardIcon from '~icons/mdi/fast-forward-10';
import SkipBackIcon from '~icons/mdi/rewind-10';
import VolumeIcon from '~icons/mdi/volume-high';

const meta = {
  title: 'Design System/Controls/IconButton',
  tags: ['autodocs'],
  component: IconButton,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A Button without a visible label: a circle, the control height across, with the same surface and state rules. `label` is required and becomes the accessible name. For toggles, pass `pressed` and swap the outline icon (off) for the filled one (on); over media the icon is the only thing that shows the state.',
      },
    },
  },
  args: {
    label: 'Mute',
    icon: <VolumeIcon />,
    size: 'md',
    onClick: fn(),
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    icon: { control: false },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

function StateMatrix({ surface }: { surface: SurfaceContextValue }) {
  return (
    <SurfaceStage surface={surface}>
      <StateCell name="Rest">
        <IconButton label="Mute" icon={<VolumeIcon />} />
      </StateCell>
      <StateCell name="Toggle off">
        <IconButton label="Subtitles" icon={<ClosedCaptionOutlineIcon />} pressed={false} />
      </StateCell>
      <StateCell name="Toggle on">
        <IconButton label="Subtitles" icon={<ClosedCaptionIcon />} pressed />
      </StateCell>
      <StateCell name="Focused">
        <IconButton label="Mute" icon={<VolumeIcon />} focused />
      </StateCell>
      <StateCell name="Focused + on">
        <IconButton label="Subtitles" icon={<ClosedCaptionIcon />} pressed focused />
      </StateCell>
      <StateCell name="Loading">
        <IconButton label="Playback settings" icon={<CogIcon />} loading />
      </StateCell>
      <StateCell name="Disabled">
        <IconButton label="Playback settings" icon={<CogIcon />} disabled />
      </StateCell>
    </SurfaceStage>
  );
}

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const StatesOnSolid: Story = {
  render: () => <StateMatrix surface="solid" />,
};

export const StatesOverMedia: Story = {
  render: () => <StateMatrix surface="overMedia" />,
};

export const Sizes: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <StateCell name="sm (web only)">
        <IconButton size="sm" label="Mute" icon={<VolumeIcon />} />
      </StateCell>
      <StateCell name="md (default)">
        <IconButton label="Mute" icon={<VolumeIcon />} />
      </StateCell>
      <StateCell name="lg">
        <IconButton size="lg" label="Mute" icon={<VolumeIcon />} />
      </StateCell>
      <StateCell name="Focused lg">
        <IconButton size="lg" label="Mute" icon={<VolumeIcon />} focused />
      </StateCell>
    </SurfaceStage>
  ),
};

function SubtitlesToggle() {
  const [on, setOn] = useState(false);
  return (
    <SurfaceStage surface="overMedia">
      <IconButton
        label="Subtitles"
        icon={on ? <ClosedCaptionIcon /> : <ClosedCaptionOutlineIcon />}
        pressed={on}
        onClick={() => setOn(value => !value)}
      />
    </SurfaceStage>
  );
}

export const Toggle: Story = {
  render: () => <SubtitlesToggle />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Subtitles' });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveFocus();
  },
};

/** A cell with room for a tooltip on either side, the button in the middle. */
function TooltipCell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <StateCell name={name}>
      <div style={{ width: '11rem', padding: '2.5rem 0', textAlign: 'center' }}>{children}</div>
    </StateCell>
  );
}

/**
 * A tooltip opens above the focused button (8.3 A). `start`/`end` alignment keeps it on screen for
 * buttons near an edge; the pointer always aims at the button.
 */
export const TooltipStates: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <div>
        <TooltipCell name="Rest">
          <IconButton label="Mute" icon={<VolumeIcon />} tooltip="Mute" />
        </TooltipCell>
        <TooltipCell name="Focused">
          <IconButton label="Mute" icon={<VolumeIcon />} tooltip="Mute" focused />
        </TooltipCell>
        <TooltipCell name="Focused, align start">
          <IconButton
            label="Back 10 seconds"
            icon={<SkipBackIcon />}
            tooltip="Back 10 seconds"
            tooltipAlign="start"
            focused
          />
        </TooltipCell>
        <TooltipCell name="Focused, align end">
          <IconButton
            label="Playback settings"
            icon={<CogIcon />}
            tooltip="Playback settings"
            tooltipAlign="end"
            focused
          />
        </TooltipCell>
      </div>
      <TooltipCell name="Focused, below">
        <IconButton
          label="Subtitles"
          icon={<ClosedCaptionIcon />}
          tooltip="Subtitles and audio"
          tooltipPlacement="bottom"
          focused
        />
      </TooltipCell>
    </SurfaceStage>
  ),
};

function PlayerControls() {
  const { itemProps } = useStoryVirtualRow(3, 1);
  return (
    <SurfaceStage surface="overMedia">
      <div style={{ paddingTop: '2.5rem' }}>
        <IconButton
          label="Back 10 seconds"
          icon={<SkipBackIcon />}
          tooltip="Back 10 seconds"
          {...itemProps(0)}
        />{' '}
        <IconButton label="Mute" icon={<VolumeIcon />} tooltip="Mute" {...itemProps(1)} />{' '}
        <IconButton
          label="Forward 10 seconds"
          icon={<SkipForwardIcon />}
          tooltip="Forward 10 seconds"
          {...itemProps(2)}
        />
      </div>
    </SurfaceStage>
  );
}

/** The tooltip follows virtual focus; Escape hides it without moving focus, until focus returns. */
export const TooltipFollowsFocus: Story = {
  render: () => <PlayerControls />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tooltipOf = (name: string) =>
      canvas.getByRole('button', { name }).parentElement as HTMLElement;
    await expect(tooltipOf('Mute')).toHaveAttribute('data-open');
    await userEvent.keyboard('{ArrowRight}');
    await expect(tooltipOf('Mute')).not.toHaveAttribute('data-open');
    await expect(tooltipOf('Forward 10 seconds')).toHaveAttribute('data-open');
    await userEvent.keyboard('{Escape}');
    await expect(tooltipOf('Forward 10 seconds')).not.toHaveAttribute('data-open');
    await expect(canvas.getByRole('button', { name: 'Forward 10 seconds' })).toHaveAttribute(
      'data-focused'
    );
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}');
    await expect(tooltipOf('Forward 10 seconds')).toHaveAttribute('data-open');
  },
};
