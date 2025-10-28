import { render, screen } from '@testing-library/react';
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

    await user.type(screen.getByLabelText(/password/i), 'password123');
    expect(submitButton).toBeEnabled();
  });

  it('submits credentials via the RTK Query mutation', async () => {
    const user = userEvent.setup();

    render(<LoginWithEmail showTitle={false} />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'superSecret!');

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
});
