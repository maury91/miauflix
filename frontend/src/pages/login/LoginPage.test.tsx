import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage from './LoginPage';

const mockWindowSize = { width: 1024, height: 768 };
const loginWithEmailSpy = vi.fn();

vi.mock('@shared/hooks/useWindowSize', () => ({
  useWindowSize: () => mockWindowSize,
}));

vi.mock('@features/auth/ui/login/LoginWithEmail', () => ({
  LoginWithEmail: ({ showTitle }: { showTitle: boolean }) => {
    loginWithEmailSpy(showTitle);
    return <div data-testid="login-with-email" data-show-title={showTitle} />;
  },
}));

vi.mock('@features/auth/ui/login/LoginWithQR', () => ({
  LoginWithQR: () => <div data-testid="login-with-qr" />,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginWithEmailSpy.mockClear();
    mockWindowSize.width = 1024;
  });

  it('shows QR login on wide screens and passes showTitle to email login', async () => {
    mockWindowSize.width = 1280;

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('login-with-email')).toHaveAttribute('data-show-title', 'true');
    });

    expect(screen.getByTestId('login-with-qr')).toBeInTheDocument();
    expect(loginWithEmailSpy).toHaveBeenLastCalledWith(true);
  });

  it('hides QR login and email title on narrow screens', () => {
    mockWindowSize.width = 600;

    render(<LoginPage />);

    expect(screen.queryByTestId('login-with-qr')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-with-email')).toHaveAttribute('data-show-title', 'false');
    expect(loginWithEmailSpy).toHaveBeenCalledWith(false);
  });
});
