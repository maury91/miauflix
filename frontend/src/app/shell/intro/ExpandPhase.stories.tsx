import type { Meta, StoryObj } from '@storybook/react-vite';

import { collapsedPhase } from './collapsePhase';
import { expandPhase } from './expandPhase';
import { IntroPhasePlayer } from './IntroPhasePlayer';

const meta: Meta<typeof IntroPhasePlayer> = {
  title: 'Animations/Intro/3. Expand',
  component: IntroPhasePlayer,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    phases: [collapsedPhase, expandPhase],
    autoStart: true,
    loop: true,
    lowResourceAnimation: false,
  },
  argTypes: { phases: { table: { disable: true } } },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The M grows, blurs and fades, revealing the page behind. */
export const Expand: Story = {};

/** As on the TV: no blur. */
export const LowResource: Story = { args: { lowResourceAnimation: true } };
