import type { Meta, StoryObj } from '@storybook/react-vite';

import { Spinner } from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Components/Spinner',
  component: Spinner,
  globals: {
    backgrounds: {
      value: 'dark',
    },
  },
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#0a0d0f' }],
    },
  },
  argTypes: {
    size: {
      control: { type: 'range', min: 12, max: 100, step: 4 },
      description: 'Size of the spinner icon in pixels',
    },
    text: {
      control: { type: 'text' },
      description: 'Loading text to display next to spinner (leave empty for no text)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: {
    text: 'Loading...',
    size: 20,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive spinner with controls. Use the controls to test different scenarios:\n\n- **With text**: Any loading message\n- **Without text**: Clear the text field\n- **Different sizes**: 12px (small) to 100px (very large)\n- **Common examples**: "Loading...", "Generating QR code", "Signing in...", "Processing..."',
      },
    },
  },
};
