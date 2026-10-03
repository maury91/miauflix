import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useCreateAdminMutation: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('@features/setup/api/setup.api', () => ({
  useCreateAdminMutation: mocks.useCreateAdminMutation,
}));
vi.mock('@store', () => ({ useAppDispatch: () => mocks.dispatch }));

import SetupPage from './SetupPage';

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCreateAdminMutation.mockReturnValue([vi.fn(), { isLoading: false, error: undefined }]);
  });

  it('provides independent accessible password visibility controls', () => {
    render(<SetupPage />);

    const password = screen.getByLabelText('Password');
    const confirmation = screen.getByLabelText('Confirm Password');
    const showPassword = screen.getByRole('button', { name: 'Show password' });
    const showConfirmation = screen.getByRole('button', {
      name: 'Show confirmation password',
    });

    expect(password).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'password');

    fireEvent.click(showPassword);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(confirmation).toHaveAttribute('type', 'password');

    fireEvent.click(showConfirmation);
    expect(confirmation).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show confirmation password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
