import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { PasswordField } from './PasswordField';

const meta = {
  title: 'Design System/Fields/PasswordField',
  tags: ['autodocs'],
  component: PasswordField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "TextField internals plus the standard reveal IconButton, the same everywhere (login, setup, provider credentials). Virtual focus sits on one part (`focusedPart`): the input shows the outline, the toggle the white fill. Revealing keeps the value, the caret and edit mode. The toggle's names come from the feature.",
      },
    },
  },
  args: {
    label: 'Password',
    showLabel: 'Show password',
    hideLabel: 'Hide password',
    placeholder: 'Enter your password',
    autoComplete: 'current-password',
    size: 'md',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    focusedPart: { control: 'inline-radio', options: [undefined, 'input', 'reveal'] },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof PasswordField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const shared = {
  label: 'Password',
  showLabel: 'Show password',
  hideLabel: 'Hide password',
  defaultValue: 'correct horse',
};

/** Focus is virtual: the navigation layer passes `focusedPart`; here it is set directly. */
export const States: Story = {
  render: () => (
    <>
      {(
        [
          ['Rest', {}],
          ['Input focused', { focusedPart: 'input' }],
          ['Reveal focused', { focusedPart: 'reveal' }],
          ['Invalid', { error: 'That password is not right.' }],
          ['Disabled', { disabled: true }],
          ['TV (lg), reveal focused', { size: 'lg', focusedPart: 'reveal' }],
        ] as const
      ).map(([name, props]) => (
        <StateCell key={name} name={name}>
          <div style={{ width: '16rem' }}>
            <PasswordField {...shared} {...props} />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

export const RevealKeepsCaret: Story = {
  args: { defaultValue: 'secret' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Password') as HTMLInputElement;
    await userEvent.click(input);
    input.setSelectionRange(2, 2);
    await userEvent.click(canvas.getByRole('button', { name: 'Show password' }));
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveFocus();
    await expect(input.selectionStart).toBe(2);
    await userEvent.keyboard('X');
    await expect(input).toHaveValue('seXcret');
    await userEvent.click(canvas.getByRole('button', { name: 'Hide password' }));
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toHaveValue('seXcret');
  },
};
