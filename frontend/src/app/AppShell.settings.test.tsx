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
const { homeRenders } = vi.hoisted(() => ({ homeRenders: { count: 0 } }));
vi.mock('@pages/home/HomePage', async () => {
  const { HomeSidebar } = await import('@pages/home/components/HomeSidebar');
  const { navigate } = await import('@app/router');
  return {
    default: function HomePageMock() {
      homeRenders.count += 1;
      return (
        <HomeSidebar
          active
          onAction={() => ({ type: 'handled' })}
          onHover={() => {}}
          onSettings={() => navigate({ type: 'settings' }, { parent: { type: 'home' } })}
          onSearch={() => {}}
          onNotifications={() => {}}
          onEnterNotifications={() => {}}
          notificationsRef={null}
          showSettings={state.admin}
          unreadCount={0}
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
/** Render and let the app finish booting (the logo leaves its centred start after two frames). */
const renderApp = async () => {
  const view = render(
    <Provider store={store}>
      <AppShell />
    </Provider>
  );
  await act(async () => {
    for (let frame = 0; frame < 2; frame += 1)
      await new Promise(resolve => requestAnimationFrame(resolve));
  });
  return view;
};

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
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configuration' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close configuration editor' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument());
  });

  it('opens Storage from settings and restores focus when returning', async () => {
    await renderApp();
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
    await renderApp();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Search' }), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument());
  });

  it('skips the hidden Settings action when navigating the sidebar as a non-admin', async () => {
    state.admin = false;
    store = createTestStore();
    await renderApp();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Search' }), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('allows non-admins to open settings while keeping configuration restricted', async () => {
    state.admin = false;
    store = createTestStore();
    await renderApp();
    // The sidebar hides Settings from non-admins, so open the route directly.
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    act(() => navigate({ type: 'settings' }, { parent: { type: 'home' } }));
    expect(screen.getByRole('button', { name: 'Configuration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Storage' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    expect(screen.queryByText('Close configuration editor')).not.toBeInTheDocument();
  });

  it.each([
    ['configuration', '/settings/configuration'],
    ['storage', '/settings/storage'],
  ] as const)(
    'sends a non-admin opening %s directly to Settings without mounting Home',
    async (type, path) => {
      state.admin = false;
      store = createTestStore();
      navigate({ type }, { replace: true });
      expect(window.location.pathname).toBe(path);
      homeRenders.count = 0;
      await renderApp();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
      );
      expect(window.location.pathname).toBe('/settings');
      expect(homeRenders.count).toBe(0);
    }
  );

  it('does not open settings when signed out', async () => {
    state.authenticated = false;
    state.page = 'login';
    store = createTestStore();
    await renderApp();
    act(() => navigate({ type: 'settings' }));
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('preserves automatic configuration setup', async () => {
    state.page = 'config_wizard';
    await renderApp();
    expect(screen.getByText('Required configuration wizard')).toBeInTheDocument();
  });
});
