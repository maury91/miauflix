import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { FieldLabel, Input } from './FormControls';

const meta = {
  title: 'Miauflix UI/Components/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Use Input for short text, email, passwords and numeric values. Always pair id with FieldLabel.htmlFor. Use aria-describedby for help/error text and invalid for validation feedback. Native required, autocomplete, min/max and inputMode remain available. Validation and password visibility state belong to the feature.',
      },
    },
  },
  decorators: [
    Story => (
      <div style={{ width: 280 }}>
        <FieldLabel htmlFor="example-input">Email</FieldLabel>
        <Story />
      </div>
    ),
  ],
  args: {
    id: 'example-input',
    type: 'email',
    placeholder: 'you@example.com',
    autoComplete: 'email',
  },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Email');
    await userEvent.type(input, 'viewer@example.com');
    await expect(input).toHaveValue('viewer@example.com');
  },
};
export const Invalid: Story = {
  args: { invalid: true, defaultValue: 'invalid', 'aria-describedby': 'email-error' },
  render: args => (
    <>
      <Input {...args} />
      <p id="email-error">Enter a valid email address.</p>
    </>
  ),
};
export const Disabled: Story = { args: { disabled: true, defaultValue: 'viewer@example.com' } };
export const Password: Story = {
  args: {
    type: 'password',
    autoComplete: 'new-password',
    placeholder: 'At least eight characters',
  },
};
