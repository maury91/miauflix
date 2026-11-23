import type { Meta, StoryObj } from '@storybook/react-vite';

import { blinkPhase } from './blinkPhase';
import { collapsePhase } from './collapsePhase';
import { expandPhase } from './expandPhase';
import { IntroPhasePlayer } from './IntroPhasePlayer';

const meta: Meta<typeof IntroPhasePlayer> = {
  title: 'Animations/Intro/Full Intro',
  component: IntroPhasePlayer,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    phases: [collapsePhase, blinkPhase, expandPhase],
    autoStart: true,
    loop: true,
    lowResourceAnimation: false,
  },
  argTypes: { phases: { table: { disable: true } } },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Collapse, blink, expand, with the sound. The browser may block the sound until the page is
 * clicked: press Replay to hear it.
 */
export const FullIntro: Story = {};

/** As on the TV: no blur. */
export const LowResource: Story = { args: { lowResourceAnimation: true } };
