import { FocusScope, NavigationProvider } from '@shared/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** The login form as the page renders it: one navigation scope around it. */
const Form = ({ showTitle = true }: { showTitle?: boolean }) => (
  <NavigationProvider>
    <FocusScope>
      <LoginWithEmail showTitle={showTitle} />
    </FocusScope>
  </NavigationProvider>
);

const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });

/** Whether virtual focus is on a field's input (its frame shows the outline). */
const fieldFocused = (label: RegExp) =>
  screen.getByLabelText(label).closest('[data-focused]') !== null;

const email = () => screen.getByLabelText(/^email$/i);
const password = () => screen.getByLabelText(/^password$/i);
const submit = () => screen.getByRole('button', { name: /continue/i });

describe('LoginWithEmail', () => {
  beforeEach(() => {
    mutationState.isLoading = false;
    mutationState.error = undefined;
    loginMock.mockReset();
    // jsdom lays nothing out; the navigation layer only focuses elements on screen
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables submit until both fields are filled', async () => {
    const user = userEvent.setup();
    render(<Form />);

    expect(submit()).toBeDisabled();
    await user.type(email(), 'user@example.com');
    expect(submit()).toBeDisabled();
    await user.type(password(), 'password123');
    expect(submit()).toBeEnabled();
  });

  it('submits credentials via the RTK Query mutation', async () => {
    const user = userEvent.setup();
    render(<Form showTitle={false} />);

    await user.type(email(), 'user@example.com');
    await user.type(password(), 'superSecret!');
    await user.click(submit());

    expect(loginMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'superSecret!',
    });
  });

  it('keeps the title for assistive technology when it is not shown', () => {
    render(<Form showTitle={false} />);

    expect(screen.getByRole('region', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('marks Continue busy while signing in, without signing in twice', async () => {
    mutationState.isLoading = true;
    const user = userEvent.setup();
    render(<Form />);

    await user.type(email(), 'user@example.com');
    await user.type(password(), 'password123');
    expect(submit()).toHaveAttribute('aria-busy', 'true');
    await user.click(submit());
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('shows the error the server returned', () => {
    mutationState.error = { data: { message: 'Invalid credentials' } };
    render(<Form />);

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('starts on the email field', () => {
    render(<Form />);

    expect(fieldFocused(/^email$/i)).toBe(true);
    // Virtual focus only: editing (and a TV's keyboard) starts with Confirm
    expect(email()).not.toHaveFocus();
    press('Enter');
    expect(email()).toHaveFocus();
  });

  it('moves between the fields and Continue with the D-pad', async () => {
    const user = userEvent.setup();
    render(<Form />);

    press('ArrowDown');
    expect(fieldFocused(/^password$/i)).toBe(true);
    // Continue is disabled until both fields are filled, so there is nothing below yet
    press('ArrowDown');
    expect(fieldFocused(/^password$/i)).toBe(true);

    await user.type(email(), 'user@example.com');
    await user.type(password(), 'password123');
    // Back leaves edit mode; Down skips the reveal toggle inside the field
    press('Escape');
    press('ArrowDown');
    expect(submit()).toHaveAttribute('data-focused');

    press('ArrowUp');
    press('ArrowUp');
    expect(fieldFocused(/^email$/i)).toBe(true);
  });

  it("moves on to the password with the TV keyboard's Done key", () => {
    render(<Form />);
    press('Enter');
    expect(email()).toHaveFocus();

    fireEvent.keyDown(email(), { key: 'Unidentified', keyCode: 65376 });
    expect(fieldFocused(/^password$/i)).toBe(true);
    expect(email()).not.toHaveFocus();
  });

  it('puts the focus back on the password after a failed sign-in', () => {
    const { rerender } = render(<Form />);
    expect(fieldFocused(/^email$/i)).toBe(true);

    mutationState.error = { data: { message: 'Invalid credentials' } };
    rerender(<Form />);

    expect(fieldFocused(/^password$/i)).toBe(true);
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    render(<Form />);
    expect(password()).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password()).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password()).toHaveAttribute('type', 'password');
  });

  it('reaches the reveal toggle with Right from the password, and comes back with Left', () => {
    render(<Form />);
    press('ArrowDown');

    press('ArrowRight');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('data-focused');
    press('Enter');
    expect(password()).toHaveAttribute('type', 'text');

    press('ArrowLeft');
    expect(fieldFocused(/^password$/i)).toBe(true);
  });

  it('follows a tap into a field', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.click(password());
    expect(fieldFocused(/^password$/i)).toBe(true);
    expect(fieldFocused(/^email$/i)).toBe(false);
  });

  it('tabs through the fields, the reveal toggle and Continue', async () => {
    const user = userEvent.setup();
    render(<Form />);

    email().focus();
    await user.keyboard('keyboard@test.com');
    await user.tab();
    await user.keyboard('keyboardpassword');
    expect(password()).toHaveValue('keyboardpassword');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveFocus();

    await user.tab();
    expect(submit()).toHaveFocus();
    expect(submit()).toBeEnabled();
  });

  it('types into the field Tab reaches', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.tab();
    await user.keyboard('a@b.c');
    expect(fieldFocused(/^password$/i)).toBe(true);
    expect(password()).toHaveValue('a@b.c');
  });
});
