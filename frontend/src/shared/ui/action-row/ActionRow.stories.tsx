import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { ActionRow } from './ActionRow';

const meta = {
  title: 'Miauflix UI/Components/Action Row',
  tags: ['autodocs'],
  component: ActionRow,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Group related actions in DOM order, with one primary action. Use density=compact for settings and direction=column on narrow surfaces; the default row wraps rather than overflowing. Place spacing on the surrounding layout instead of extending buttons.',
      },
    },
  },
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
export const Stacked: Story = { args: { direction: 'column' } };
export const Compact: Story = {
  args: {
    density: 'compact',
    children: (
      <>
        <Button color="secondary" appearance="settings" size="small">
          Test
        </Button>
        <Button appearance="settings" size="small">
          Save
        </Button>
      </>
    ),
  },
};
