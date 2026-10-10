import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { FieldLabel, Select } from './FormControls';

const meta = {
  title: 'Miauflix UI/Components/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Use Select for a finite set of mutually exclusive values. Use a Switch for a boolean. Supply native option children, an id/label pair and an explicit default or controlled value. A unit selector next to an Input needs its own accessible label. Keep parsing and persistence in the feature.',
      },
    },
  },
  decorators: [
    Story => (
      <div>
        <FieldLabel htmlFor="quality">Quality</FieldLabel>
        <Story />
      </div>
    ),
  ],
  args: {
    id: 'quality',
    defaultValue: 'auto',
    children: (
      <>
        <option value="auto">Automatic</option>
        <option value="1080">1080p</option>
        <option value="720">720p</option>
      </>
    ),
  },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByLabelText('Quality');
    await userEvent.selectOptions(select, '1080');
    await expect(select).toHaveValue('1080');
  },
};
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = {
  args: { invalid: true, 'aria-describedby': 'quality-error' },
  render: args => (
    <>
      <Select {...args} />
      <p id="quality-error">Choose an available quality.</p>
    </>
  ),
};
