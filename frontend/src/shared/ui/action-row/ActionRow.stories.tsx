import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { ActionRow } from './ActionRow';

const meta = {
  title: 'UI Elements/Action Row',
  component: ActionRow,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 'min(600px, 90vw)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <>
        <Button>Continue</Button>
        <Button color="secondary">Cancel</Button>
      </>
    ),
  },
} satisfies Meta<typeof ActionRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Stacked: Story = { args: { style: { flexDirection: 'column' } } };
export const Compact: Story = {
  args: {
    style: { gap: 10, marginTop: 18, paddingTop: 16 },
    children: (
      <>
        <Button color="secondary" style={{ minHeight: 36, minWidth: 0, fontSize: 14 }}>
          Test
        </Button>
        <Button style={{ minHeight: 36, minWidth: 0, fontSize: 14 }}>Save</Button>
      </>
    ),
  },
};
