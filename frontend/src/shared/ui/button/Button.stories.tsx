import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button';

import ExternalLinkIcon from '~icons/mdi/open-in-new';

const meta = {
  title: 'Miauflix UI/Components/Button',
  tags: ['autodocs'],
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Use Button for an action, not a destination link. Use one primary action per group and secondary for alternatives. Brand/large is the existing TV-friendly default; settings/small or medium is for account and configuration forms. Icons are decorative: iconOnly requires an aria-label. Use size, appearance and fullWidth instead of styling Button. Native disabled, type and ref behavior is preserved.',
      },
    },
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

export const CollapsibleIcon: Story = {
  args: {
    color: 'secondary',
    icon: <ExternalLinkIcon />,
    children: 'Open externally',
    collapseWhenNotFocused: true,
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
    iconOnly: true,
  },
};

export const Settings: Story = {
  args: { appearance: 'settings', size: 'medium', children: 'Save configuration' },
};
export const CompactSecondary: Story = {
  args: { appearance: 'settings', size: 'small', color: 'secondary', children: 'Test' },
};
export const FullWidth: Story = {
  args: { appearance: 'settings', size: 'medium', fullWidth: true, children: 'Create account' },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};

export const TextAction: Story = {
  args: { appearance: 'settings', variant: 'text', size: 'small', children: 'Optional settings' },
};
