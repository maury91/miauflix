import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button';

const ExternalLinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M14 5h5v5" />
    <path d="m13 11 6-6" />
    <path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

const meta = {
  title: 'UI Elements/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    color: {
      control: 'inline-radio',
      options: ['primary', 'secondary'],
    },
    icon: {
      control: false,
    },
    children: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    color: 'primary',
    children: "Let's go",
  },
};

export const Secondary: Story = {
  args: {
    color: 'secondary',
    children: "Don't ask again",
  },
};

export const WithIcon: Story = {
  args: {
    color: 'primary',
    icon: <ExternalLinkIcon />,
    children: "Let's go",
  },
};

export const KeyboardFocus: Story = {
  args: {
    color: 'primary',
    icon: <ExternalLinkIcon />,
    children: "Let's go",
    autoFocus: true,
  },
};

export const Disabled: Story = {
  args: {
    color: 'secondary',
    children: "Don't ask again",
    disabled: true,
  },
};

export const IconOnly: Story = {
  args: {
    color: 'secondary',
    icon: <ExternalLinkIcon />,
    'aria-label': 'Open externally',
    children: null,
    style: { minWidth: 56, padding: 12 },
  },
};
