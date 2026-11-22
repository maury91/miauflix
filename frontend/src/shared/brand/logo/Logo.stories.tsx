import type { Meta, StoryObj } from '@storybook/react-vite';

import { Logo } from './Logo';
import { StaticLogo } from './StaticLogo';

const meta: Meta<typeof Logo> = {
  title: 'UI Elements/Logo',
  component: Logo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Logo>;

/** Centred and pulsing, as while the app loads (and in the server-rendered page). */
export const Loading: Story = { args: { position: 'intro', pulsing: true } };

/** Home's corner, lined up with its cards' margin. */
export const Home: Story = { args: { position: 'home', homeLeft: 96 } };

/** Search, settings and profiles: right of the back rail. */
export const Inner: Story = { args: { position: 'inner' } };

/** Details: over the title's information. */
export const Details: Story = { args: { position: 'details' } };

/** Sign-in, setup and QR approval: a static image heading the page. */
export const Static: Story = {
  render: () => (
    <div style={{ paddingTop: '4rem' }}>
      <StaticLogo />
    </div>
  ),
};
