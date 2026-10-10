import type { AppState } from '@app/hooks/useAppState';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authenticated: true,
  admin: true,
  page: 'home' as AppState,
  dispatch: vi.fn(),
}));

vi.mock('@app/hooks/useAppState', () => ({ useAppState: () => state.page }));
vi.mock('@store', () => ({
  useAppDispatch: () => state.dispatch,
  useAppSelector: (selector: () => unknown) => selector(),
}));
vi.mock('@store/slices/auth', () => ({
  selectIsAuthenticated: () => state.authenticated,
  selectIsAdmin: () => state.admin,
}));
vi.mock('@store/slices/appState', () => ({ dismissConfigWizard: () => ({ type: 'dismiss' }) }));
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
  return {
    default: () => (
      <HomeSidebar
        active
        onAction={() => ({ type: 'handled' })}
        onHover={() => {}}
        onSettings={() => window.dispatchEvent(new Event('miauflix:settings:open'))}
      />
    ),
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

import AppShell from './AppShell';

beforeEach(() => {
  state.authenticated = true;
  state.admin = true;
  state.page = 'home';
  state.dispatch.mockClear();
});
afterEach(cleanup);

describe('Settings navigation', () => {
  it('opens settings from the sidebar, edits configuration, and returns home', () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configuration' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close configuration editor' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it('opens Storage from settings and restores focus when returning', () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Storage' }));
    expect(screen.getByRole('heading', { name: 'Storage' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveFocus();
  });

  it('opens the selected Settings action with a remote and supports back navigation', () => {
    render(<AppShell />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Home' }), { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });

  it('allows non-admins to open settings while keeping configuration restricted', () => {
    state.admin = false;
    render(<AppShell />);
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
    render(<AppShell />);
    act(() => window.dispatchEvent(new Event('miauflix:settings:open')));
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('preserves automatic configuration setup', () => {
    state.page = 'config_wizard';
    render(<AppShell />);
    expect(screen.getByText('Required configuration wizard')).toBeInTheDocument();
  });
});
