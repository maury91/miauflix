import type { Meta, StoryObj } from '@storybook/react-vite';

import { collapsePhase } from './collapsePhase';
import { IntroPhasePlayer } from './IntroPhasePlayer';

const phases = [collapsePhase];

const meta: Meta<typeof IntroPhasePlayer> = {
  title: 'Animations/Intro/1. Collapse',
  component: IntroPhasePlayer,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: { phases, autoStart: true, loop: true, lowResourceAnimation: false },
  argTypes: { phases: { table: { disable: true } } },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** "Miauwatch" collapses into its M, which ends centred. Replays on a loop. */
export const Collapse: Story = {};

/** As on the TV: the same motion, without costly effects. */
export const LowResource: Story = { args: { lowResourceAnimation: true } };
