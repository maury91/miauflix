import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginWithEmail } from './LoginWithEmail';

type MutationState = {
  isLoading: boolean;
  error: unknown;
};

const mutationState: MutationState = {
  isLoading: false,
  error: undefined,
};

const loginMock = vi.fn();

vi.mock('@features/auth/api/auth.api', () => ({
  useLoginMutation: () => [loginMock, mutationState],
}));

describe('LoginWithEmail', () => {
  beforeEach(() => {
    mutationState.isLoading = false;
    mutationState.error = undefined;
    loginMock.mockReset();
  });

  it('disables submit until both fields are filled', async () => {
    const user = userEvent.setup();

    render(<LoginWithEmail showTitle />);
    const submitButton = screen.getByRole('button', { name: /continue/i });

    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    expect(submitButton).toBeEnabled();
  });

  it('submits credentials via the RTK Query mutation', async () => {
    const user = userEvent.setup();

    render(<LoginWithEmail showTitle={false} />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'superSecret!');

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(loginMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'superSecret!',
    });
  });

  it('shows loading label when login is in progress', async () => {
    mutationState.isLoading = true;

    render(<LoginWithEmail showTitle />);

    const button = screen.getByRole('button', { name: /signing in/i });
    expect(button).toBeDisabled();
  });

  it('renders a formatted error message when login fails', () => {
    mutationState.error = { data: { message: 'Invalid credentials' } };

    render(<LoginWithEmail showTitle />);

    expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it('starts on the email field when asked, for a TV remote', () => {
    render(<LoginWithEmail showTitle autoFocus />);

    expect(screen.getByLabelText(/email/i)).toHaveFocus();
  });

  it('moves between the fields and Continue with the D-pad', async () => {
    const user = userEvent.setup();
    render(<LoginWithEmail showTitle autoFocus />);
    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/^password$/i);

    await user.keyboard('{ArrowDown}');
    expect(password).toHaveFocus();
    // Continue is disabled until both fields are filled, so there is nothing below yet
    await user.keyboard('{ArrowDown}');
    expect(password).toHaveFocus();

    await user.type(email, 'user@example.com');
    await user.type(password, 'password123');
    // Down skips the show-password toggle inside the field
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /continue/i })).toHaveFocus();

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(email).toHaveFocus();
  });

  it("moves to the next field with the TV keyboard's Done key", () => {
    render(<LoginWithEmail showTitle autoFocus />);

    fireEvent.keyDown(screen.getByLabelText(/email/i), { key: 'Unidentified', keyCode: 65376 });
    expect(screen.getByLabelText(/^password$/i)).toHaveFocus();
  });

  it('puts the focus back on the password after a failed sign-in', () => {
    const { rerender } = render(<LoginWithEmail showTitle autoFocus />);
    (document.activeElement as HTMLElement).blur();

    mutationState.error = { data: { message: 'Invalid credentials' } };
    rerender(<LoginWithEmail showTitle autoFocus />);

    expect(screen.getByLabelText(/^password$/i)).toHaveFocus();
  });

  it('brings a remote key that finds nothing focused back to the email field', () => {
    render(<LoginWithEmail showTitle autoFocus />);
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();

    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(screen.getByLabelText(/email/i)).toHaveFocus();
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    render(<LoginWithEmail showTitle />);
    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('reaches the show-password toggle with Right at the end of the password', async () => {
    const user = userEvent.setup();
    render(<LoginWithEmail showTitle />);
    const password = screen.getByLabelText(/^password$/i);

    await user.type(password, 'secret');
    await user.keyboard('{ArrowLeft}{ArrowRight}');
    expect(password).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(password).toHaveFocus();
  });

  it('on a TV, moves from the password to the toggle and on to the right', async () => {
    const user = userEvent.setup();
    const onRightFromToggle = vi.fn(() => true);
    render(<LoginWithEmail showTitle autoFocus onRightFromToggle={onRightFromToggle} />);
    const password = screen.getByLabelText(/^password$/i);

    await user.type(password, 'secret');
    await user.keyboard('{Home}{ArrowRight}');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText(/^password$/i)).not.toHaveFocus();
    toggle.focus();
    await user.keyboard('{ArrowRight}');
    expect(onRightFromToggle).toHaveBeenCalled();
  });
});
