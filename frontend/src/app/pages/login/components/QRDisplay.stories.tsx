import type { Meta, StoryObj } from '@storybook/react-vite';

import { QRDisplay } from './QRDisplay';

const meta: Meta<typeof QRDisplay> = {
  title: 'Login/QRDisplay',
  component: QRDisplay,
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
    isLoading: {
      control: { type: 'boolean' },
      description: 'Show loading state with spinner and skeleton',
    },
    codeUrl: {
      control: { type: 'text' },
      description: 'URL encoded in the QR code',
    },
    userCode: {
      control: { type: 'text' },
      description: 'User-readable code displayed below QR',
    },
    timeRemaining: {
      control: { type: 'range', min: 0, max: 900, step: 30 },
      description: 'Time remaining in seconds (0 = expired, <60 = warning)',
    },
    qrSize: {
      control: { type: 'range', min: 80, max: 300, step: 20 },
      description: 'Size of the QR code in pixels',
    },
    instructions: {
      control: { type: 'text' },
      description: 'Custom instructions text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: {
    isLoading: false,
    codeUrl: 'https://miauflix.local/auth/device?code=ABC123DEF456',
    userCode: 'ABC123DEF456',
    timeRemaining: 600, // 10 minutes
    qrSize: 140,
    instructions: 'Scan with phone to sign in',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive QR display with all states. Use the controls to test different scenarios:\n\n- **Loading state**: isLoading = true (shows spinner and skeleton)\n- **Normal state**: timeRemaining > 60\n- **Warning state**: timeRemaining 1-59 (orange color)\n- **Expired state**: timeRemaining = 0 (red color)\n- **Size variations**: qrSize 80-300px\n- **Different codes**: short vs long userCode values',
      },
    },
    layout: 'centered',
  },
};
