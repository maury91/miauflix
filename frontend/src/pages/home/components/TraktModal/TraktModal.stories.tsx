import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { TraktModal } from './TraktModal';

const meta = {
  title: 'Home/Trakt Modal',
  component: TraktModal,
  parameters: { layout: 'fullscreen' },
  args: {
    sessionId: 'storybook-session',
    onConnected: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof TraktModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
