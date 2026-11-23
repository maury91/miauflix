import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../../button/Button';
import { PasswordField } from '../../field/PasswordField';
import { TextField } from '../../field/TextField';
import { Message } from '../../message/Message';
import { InitialFocus, NavigationStage, SurfaceStage } from '../../storyHelpers';
import { FormSection } from './FormSection';

const meta = {
  title: 'Design System/Product Patterns/FormSection',
  tags: ['autodocs'],
  component: FormSection,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A form’s structure: a Section heading it, the fields stacked, the form’s Message (a failed submit, a saved notice) and its actions, primary first. It owns layout and the submit event (Enter in a field, the submit Button; the page never reloads) and sets `aria-busy` while submitting. Values, validation and requests stay with the feature; per-field errors belong to each Field. Login, setup and provider credentials share it.',
      },
    },
  },
  args: { title: 'Sign in', onSubmit: () => undefined, children: null, actions: null },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ maxWidth: '28rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof FormSection>;

export default meta;
type Story = StoryObj<typeof FormSection>;

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempts, setAttempts] = useState(0);
  return (
    <NavigationStage>
      <FormSection
        title="Sign in"
        description="Use the account your server administrator created."
        onSubmit={() => {
          setAttempts(count => count + 1);
          setFailed(password !== 'miauwatch');
        }}
        message={
          failed ? (
            <Message tone="danger" toneLabel="Error" live="assertive">
              The email or password is wrong.
            </Message>
          ) : undefined
        }
        actions={
          <Button type="submit" navId="continue">
            Continue
          </Button>
        }
      >
        <TextField
          navId="email"
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
        <PasswordField
          navId="password"
          label="Password"
          showLabel="Show password"
          hideLabel="Hide password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
        />
      </FormSection>
      <p data-testid="attempts" style={{ color: 'white' }}>{`Attempts: ${attempts}`}</p>
      <InitialFocus id="email" />
    </NavigationStage>
  );
}

/** Down moves through the fields to Continue; a failed submit shows the form's Message. */
export const LoginForm: Story = {
  render: () => <Login />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Sign in' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const submit = canvas.getByRole('button', { name: 'Continue' });
    await expect(submit).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByTestId('attempts')).toHaveTextContent('Attempts: 1');
    await expect(canvas.getByRole('alert')).toHaveTextContent('The email or password is wrong.');
    // Enter in a field submits too, without reloading the page
    await userEvent.type(canvas.getByLabelText('Password'), 'miauwatch{Enter}');
    await expect(canvas.getByTestId('attempts')).toHaveTextContent('Attempts: 2');
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};
