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
  const { navigate } = await import('@app/router');
  return {
    default: function HomePageMock() {
      homeRenders.count += 1;
      // Home's settings panel opens each area as a page of its own
      return (
        <main>
          <h1>Home</h1>
          <button onClick={() => navigate({ type: 'configuration' }, { parent: { type: 'home' } })}>
            Configuration
          </button>
          <button onClick={() => navigate({ type: 'storage' }, { parent: { type: 'home' } })}>
            Storage
          </button>
        </main>
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
      <button onClick={onDismiss}>Back</button>
    </main>
  ),
}));
vi.mock('@pages/login/LoginPage', () => ({ default: () => <div>Login</div> }));
vi.mock('@pages/profiles/WhosWatchingPage', () => ({ default: () => <div>Who’s watching</div> }));
vi.mock('@pages/profiles/ProfileEditorPage', () => ({ default: () => null }));
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
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate({ type: 'home' }, { replace: true });
});

describe('Settings areas', () => {
  it('opens configuration from Home and returns there', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close configuration editor' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument());
    expect(window.location.pathname).toBe('/');
  });

  it('opens Storage from Home and returns there', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Storage' }));
    expect(screen.getByRole('heading', { name: 'Storage' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument());
  });

  it('sends the old settings page to Home', async () => {
    navigate({ type: 'storage' }, { replace: true });
    window.history.replaceState(null, '', '/settings');
    await renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument());
  });

  it.each([
    ['configuration', '/settings/configuration'],
    ['storage', '/settings/storage'],
    ['sources', '/settings/sources'],
  ] as const)('sends a non-admin opening %s directly to Home', async (type, path) => {
    state.admin = false;
    store = createTestStore();
    navigate({ type }, { replace: true });
    expect(window.location.pathname).toBe(path);
    await renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument());
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText('Close configuration editor')).not.toBeInTheDocument();
  });

  it('does not open a settings area when signed out', async () => {
    state.authenticated = false;
    state.page = 'login';
    store = createTestStore();
    await renderApp();
    act(() => navigate({ type: 'storage' }));
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Storage' })).not.toBeInTheDocument();
  });

  it('preserves automatic configuration setup', async () => {
    state.page = 'config_wizard';
    await renderApp();
    expect(screen.getByText('Required configuration wizard')).toBeInTheDocument();
  });
});
