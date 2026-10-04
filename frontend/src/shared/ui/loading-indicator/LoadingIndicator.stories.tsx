import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { LoadingIndicator } from './LoadingIndicator';

const meta = {
  title: 'UI Elements/Loading Indicator',
  component: LoadingIndicator,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ color: '#ff2547', fontSize: 40 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoadingIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Waiting: Story = {
  render: () => (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <LoadingIndicator />
      <span style={{ color: '#f5f6f8', fontSize: 18 }}>Waiting for authorization...</span>
    </div>
  ),
};
export const InButton: Story = {
  render: () => (
    <Button disabled>
      <LoadingIndicator style={{ fontSize: 16 }} />
      Saving
    </Button>
  ),
};
