import '../../assets/app.scss';

import type { Meta, StoryObj } from '@storybook/react-vite';

import { Logo } from './logo';

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
type Story = StoryObj<typeof meta>;

// Basic logo story
export const Default: Story = {
  render: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '7vw',
      }}
    >
      <Logo />
    </div>
  ),
};

// Different sizes
export const Small: Story = {
  render: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '3vw',
      }}
    >
      <Logo />
    </div>
  ),
};

export const Large: Story = {
  render: () => (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12vw',
      }}
    >
      <Logo />
    </div>
  ),
};
