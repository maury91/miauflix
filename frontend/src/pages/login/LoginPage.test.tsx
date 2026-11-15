import { configureStore } from '@reduxjs/toolkit';
import { measurementsSlice } from '@store/slices/measurements';
import { act, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage from './LoginPage';

const loginWithEmailSpy = vi.fn();

/** Render at a window width, as measured by the browser adapter. */
const renderAt = (width: number, element: ReactElement) => {
  const store = configureStore({
    reducer: { measurements: measurementsSlice.reducer },
    preloadedState: { measurements: { window: { width, height: 768 } } },
  });
  return { ...rtlRender(<Provider store={store}>{element}</Provider>), store };
};

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
  });

  it('shows QR login on wide screens and passes showTitle to email login', async () => {
    renderAt(1280, <LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId('login-with-email')).toHaveAttribute('data-show-title', 'true');
    });

    expect(screen.getByTestId('login-with-qr')).toBeInTheDocument();
    expect(loginWithEmailSpy).toHaveBeenLastCalledWith(true);
  });

  it('keeps the email form mounted when the QR panel comes and goes', async () => {
    const { store } = renderAt(600, <LoginPage />);
    const form = screen.getByTestId('login-with-email');

    act(() => {
      store.dispatch(measurementsSlice.actions.windowSizeChanged({ width: 1280, height: 768 }));
    });
    await waitFor(() => expect(screen.getByTestId('login-with-qr')).toBeInTheDocument());
    // The same element: what was typed in the form survives
    expect(screen.getByTestId('login-with-email')).toBe(form);

    act(() => {
      store.dispatch(measurementsSlice.actions.windowSizeChanged({ width: 600, height: 768 }));
    });
    await waitFor(() => expect(screen.queryByTestId('login-with-qr')).not.toBeInTheDocument());
    expect(screen.getByTestId('login-with-email')).toBe(form);
  });

  it('hides QR login and email title on narrow screens', () => {
    renderAt(600, <LoginPage />);

    expect(screen.queryByTestId('login-with-qr')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-with-email')).toHaveAttribute('data-show-title', 'false');
    expect(loginWithEmailSpy).toHaveBeenCalledWith(false);
  });
});
