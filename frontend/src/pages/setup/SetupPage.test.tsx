import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useCreateAdminMutation: vi.fn(),
  createAdmin: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('@features/setup/api/setup.api', () => ({
  useCreateAdminMutation: mocks.useCreateAdminMutation,
}));
vi.mock('@store', () => ({ useAppDispatch: () => mocks.dispatch }));

import SetupPage from './SetupPage';

const fieldFocused = (label: string) =>
  screen.getByLabelText(label).closest('[data-focused]') !== null;

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdmin.mockResolvedValue({ error: { status: 409 } });
    mocks.useCreateAdminMutation.mockReturnValue([
      mocks.createAdmin,
      { isLoading: false, error: undefined },
    ]);
    // jsdom lays nothing out; the navigation layer only focuses elements on screen
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides independent accessible password visibility controls', () => {
    render(<SetupPage />);

    const password = screen.getByLabelText('Password');
    const confirmation = screen.getByLabelText('Confirm password');

    expect(password).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(confirmation).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show confirmation password' }));
    expect(confirmation).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide confirmation password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('starts on the email field', () => {
    render(<SetupPage />);

    expect(fieldFocused('Email')).toBe(true);
  });

  it('describes the password strength', async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAccessibleDescription('At least 8 characters');

    await user.type(password, 'Abcdefgh1234!');
    expect(password).toHaveAccessibleDescription('Strength: Strong');
  });

  it('shows a mismatch on the confirmation and focuses it, without creating the account', async () => {
    const user = userEvent.setup();
    render(<SetupPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password124');
    await user.click(screen.getByRole('button', { name: 'Create admin account' }));

    const confirmation = screen.getByLabelText('Confirm password');
    expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    expect(confirmation).toHaveAccessibleDescription(/Passwords do not match/);
    expect(fieldFocused('Confirm password')).toBe(true);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it('creates the account when the form is valid', async () => {
    const user = userEvent.setup();
    render(<SetupPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123{Enter}');

    expect(mocks.createAdmin).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'password123',
    });
  });

  it('shows an error and focuses a malformed email without creating the account', async () => {
    const user = userEvent.setup();
    render(<SetupPage />);

    const email = screen.getByLabelText('Email');
    await user.type(email, 'malformed');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create admin account' }));

    expect(email).toHaveAccessibleDescription('Enter a valid email address');
    expect(fieldFocused('Email')).toBe(true);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
});
