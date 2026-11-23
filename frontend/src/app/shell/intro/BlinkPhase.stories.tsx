import type { Meta, StoryObj } from '@storybook/react-vite';

import { blinkPhase } from './blinkPhase';
import { collapsedPhase, collapsePhase } from './collapsePhase';
import { IntroPhasePlayer } from './IntroPhasePlayer';

const meta: Meta<typeof IntroPhasePlayer> = {
  title: 'Animations/Intro/2. Blink',
  component: IntroPhasePlayer,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    phases: [collapsedPhase, blinkPhase],
    autoStart: true,
    loop: true,
    lowResourceAnimation: false,
  },
  argTypes: { phases: { table: { disable: true } } },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The M blinks on each "pam" of the intro sound. The browser may block the sound until the page
 * is clicked: press Replay to hear it.
 */
export const Blink: Story = {};

/** The collapse, then the blink, as they play in the intro. */
export const AfterCollapse: Story = { args: { phases: [collapsePhase, blinkPhase] } };
