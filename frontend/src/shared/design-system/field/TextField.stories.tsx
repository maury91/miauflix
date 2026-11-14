import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { IconButton } from '../icon-button/IconButton';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { fieldActionSize } from './fieldParts';
import { PasswordField } from './PasswordField';
import { TextField } from './TextField';

import CopyIcon from '~icons/mdi/content-copy';
import EmailIcon from '~icons/mdi/email-outline';

const meta = {
  title: 'Design System/Fields/TextField',
  tags: ['autodocs'],
  component: TextField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A single-line text field: the shared Field anatomy (label, indicator, description, error) around the shared input frame. Fields cannot invert, so virtual focus (`focused`) is a white outline outside the frame; DOM focus is used only in edit mode, for the caret and the IME. Confirm enters edit mode; Escape or Back leaves it. All text comes from the feature. Position it from the parent; it accepts no className or style.',
      },
    },
  },
  args: {
    label: 'Email',
    placeholder: 'name@example.com',
    size: 'md',
    onChange: fn(),
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    leading: { control: false },
    trailing: { control: false },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ maxWidth: '22rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { description: 'We only use it to sign you in.', type: 'email' },
};

const cell = { width: '16rem' };

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const States: Story = {
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
  render: () => (
    <>
      {(
        [
          ['Rest', {}],
          ['Filled', { defaultValue: 'ada@example.com' }],
          ['Focused', { focused: true }],
          ['Indicator + description', { indicator: 'Optional', description: 'Shown to others.' }],
          ['Invalid', { defaultValue: 'ada@', error: 'Enter a full email address.' }],
          [
            'Invalid + focused',
            { defaultValue: 'ada@', error: 'Enter a full email address.', focused: true },
          ],
          ['Read-only', { defaultValue: 'ada@example.com', readOnly: true }],
          ['Disabled', { defaultValue: 'ada@example.com', disabled: true }],
          ['Leading icon', { leading: <EmailIcon /> }],
        ] as const
      ).map(([name, props]) => (
        <StateCell key={name} name={name}>
          <div style={cell}>
            <TextField label="Email" placeholder="name@example.com" {...props} />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

export const Sizes: Story = {
  render: () => (
    <>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <StateCell key={size} name={size === 'sm' ? 'sm (web only)' : size}>
          <div style={cell}>
            <TextField
              label="Server address"
              size={size}
              defaultValue="http://192.168.1.20:3000"
              trailing={
                <IconButton size={fieldActionSize[size]} label="Copy" icon={<CopyIcon />} />
              }
            />
          </div>
        </StateCell>
      ))}
    </>
  ),
};

function SignInForm() {
  const [submitted, setSubmitted] = useState(0);
  const { containerRef, focus, isFocused, focusedId } = useStoryVirtualFocus([
    ['email'],
    ['password:input', 'password:reveal'],
    ['continue'],
  ]);
  const [email, setEmail] = useState('');
  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <TextField
        label="Email"
        type="email"
        placeholder="name@example.com"
        value={email}
        onChange={event => setEmail(event.target.value)}
        focused={isFocused('email')}
        onPointerFocus={() => focus('email')}
      />
      <PasswordField
        label="Password"
        showLabel="Show password"
        hideLabel="Hide password"
        defaultValue="hunter2"
        focusedPart={
          focusedId === 'password:input'
            ? 'input'
            : focusedId === 'password:reveal'
              ? 'reveal'
              : undefined
        }
        onPointerFocus={part => focus(`password:${part}`)}
      />
      <Button
        fullWidth
        focused={isFocused('continue')}
        onMouseMove={() => focus('continue')}
        onClick={() => setSubmitted(count => count + 1)}
      >
        Continue
      </Button>
      <p style={{ margin: 0, color: '#a6adaf' }}>Submitted: {submitted}</p>
    </div>
  );
}

/**
 * A sign-in form under one virtual focus: Up/Down between fields, Right from the password input to
 * its reveal toggle and Left back. Confirm on a field enters edit mode; Escape leaves it.
 */
export const VirtualFocusForm: Story = {
  render: () => <SignInForm />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByLabelText('Email');
    const password = canvas.getByLabelText('Password');
    const reveal = canvas.getByRole('button', { name: 'Show password' });
    const frameOf = (input: HTMLElement) => input.parentElement as HTMLElement;

    await expect(frameOf(email)).toHaveAttribute('data-focused');
    // Confirm enters edit mode: DOM focus goes to the input, arrows belong to it
    await userEvent.keyboard('{Enter}');
    await expect(email).toHaveFocus();
    await userEvent.keyboard('ada@example.com{ArrowLeft}');
    await expect(frameOf(email)).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Escape}');
    await expect(email).not.toHaveFocus();
    await expect(email).toHaveValue('ada@example.com');

    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    await expect(frameOf(password)).not.toHaveAttribute('data-focused');
    await expect(reveal).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(canvas.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(canvas.getByText('Submitted: 1')).toBeInTheDocument();

    // The pointer focuses the field it moves onto
    await userEvent.hover(email);
    await expect(frameOf(email)).toHaveAttribute('data-focused');
  },
};

export const LabelledAndDescribed: Story = {
  args: {
    label: 'Email',
    description: 'We only use it to sign you in.',
    error: 'Enter a full email address.',
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: 'Email' });
    await expect(input).toHaveAccessibleDescription(
      'We only use it to sign you in. Enter a full email address.'
    );
    await expect(input).toBeInvalid();
  },
};
