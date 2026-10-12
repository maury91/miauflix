import type { AppState } from '@app/hooks/useAppState';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authenticated: true,
  admin: true,
  page: 'home' as AppState,
}));

vi.mock('@app/hooks/useAppState', () => ({ useAppState: () => state.page }));
vi.mock('@app/shell/IntroAnimation', () => ({ IntroAnimation: () => null }));
vi.mock('@shared/ui/logo/Logo', () => ({ Logo: () => null }));
vi.mock('@shared/components', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  MotionConfig: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@pages/home/HomePage', async () => {
  const { HomeSidebar } = await import('@pages/home/components/HomeSidebar');
  const { navigate } = await import('@app/router');
  return {
    default: function HomePageMock() {
      return (
        <HomeSidebar
          active
          onAction={() => ({ type: 'handled' })}
          onHover={() => {}}
          onSettings={() => navigate({ type: 'settings' }, { parent: { type: 'home' } })}
        />
      );
    },
  };
});
vi.mock('@pages/config/ConfigWizardPage', () => ({
  default: ({ onDismiss }: { onDismiss: () => void }) => (
    <button onClick={onDismiss}>Close configuration editor</button>
  ),
}));
vi.mock('@pages/config/ConfigurationWizardPage', () => ({
  default: () => <div>Required configuration wizard</div>,
}));
vi.mock('@pages/settings/StoragePage', () => ({
  default: ({ onDismiss }: { onDismiss: () => void }) => (
    <main>
      <h1>Storage</h1>
      <button onClick={onDismiss}>Back to Settings</button>
    </main>
  ),
}));
vi.mock('@pages/login/LoginPage', () => ({ default: () => <div>Login</div> }));
vi.mock('@pages/setup/SetupPage', () => ({ default: () => null }));
vi.mock('@pages/qr/QrApprovalPage', () => ({ default: () => null }));

import { appStateSlice } from '@store/slices/appState';
import { authSlice } from '@store/slices/auth';

import AppShell from './AppShell';
import { navigate } from './router';

function createTestStore() {
  const initialAppState = appStateSlice.reducer(undefined, { type: 'test/init' });
  const initialAuthState = authSlice.reducer(undefined, { type: 'test/init' });
  return configureStore({
    reducer: { appState: appStateSlice.reducer, auth: authSlice.reducer },
    preloadedState: {
      appState: { ...initialAppState, introPhase: 'complete' },
      auth: {
        ...initialAuthState,
        currentSessionId: state.authenticated ? 'test-session' : null,
        currentUser: state.authenticated
          ? {
              id: 'test-user',
              email: 'test@example.com',
              displayName: 'Test user',
              role: state.admin ? 'admin' : 'user',
            }
          : null,
      },
    },
  });
}

let store = createTestStore();
const renderApp = () =>
  render(
    <Provider store={store}>
      <AppShell />
    </Provider>
  );

beforeEach(() => {
  state.authenticated = true;
  state.admin = true;
  state.page = 'home';
  store = createTestStore();
  navigate({ type: 'home' }, { replace: true });
});
afterEach(() => {
  cleanup();
  navigate({ type: 'home' }, { replace: true });
});

describe('Settings navigation', () => {
  it('opens settings from the sidebar, edits configuration, and returns home', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configuration' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close configuration editor' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument());
  });

  it('opens Storage from settings and restores focus when returning', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Storage' }));
    expect(screen.getByRole('heading', { name: 'Storage' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveFocus();
  });

  it('opens the selected Settings action with a remote and supports back navigation', async () => {
    renderApp();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Home' }), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument());
  });

  it('allows non-admins to open settings while keeping configuration restricted', () => {
    state.admin = false;
    store = createTestStore();
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Storage' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    expect(screen.queryByText('Close configuration editor')).not.toBeInTheDocument();
  });

  it('does not open settings when signed out', () => {
    state.authenticated = false;
    state.page = 'login';
    store = createTestStore();
    renderApp();
    act(() => navigate({ type: 'settings' }));
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('preserves automatic configuration setup', () => {
    state.page = 'config_wizard';
    renderApp();
    expect(screen.getByText('Required configuration wizard')).toBeInTheDocument();
  });
});
