import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import WhosWatchingPage, { type WhosWatchingPageProps } from './WhosWatchingPage';

vi.mock('@features/profiles/avatar/runtime', () => ({
  liveAvatarsSupported: () => false,
  loadPlushies: () => new Promise(() => undefined),
}));

const session = (id: string, userId: string, name: string, role: 'admin' | 'user' = 'user') => ({
  session: id,
  user: {
    id: userId,
    email: `${userId}@example.com`,
    displayName: name,
    role,
    avatar: null,
    avatarVersion: null,
  },
});

const setupTest = (
  sessions = [session('s1', 'user-1', 'Maurizio', 'admin'), session('s2', 'user-2', 'Alex')],
  props: Partial<WhosWatchingPageProps> = {}
) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: { currentSessionId: null, currentUser: null, availableSessions: sessions },
    },
  });
  const handlers = {
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onManage: vi.fn(),
    onDone: vi.fn(),
    onBack: vi.fn(),
  };
  render(
    <Provider store={store}>
      <WhosWatchingPage {...handlers} {...props} />
    </Provider>
  );
  return handlers;
};

describe('WhosWatchingPage', () => {
  it('lists the device’s profiles and switches to the chosen one', () => {
    const { onSelect } = setupTest();

    expect(screen.getByRole('heading', { name: 'Who’s watching?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alex' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ session: 's2' }));
  });

  it('offers Add profile only when an admin profile is signed in', () => {
    const { onAdd } = setupTest();
    fireEvent.click(screen.getByRole('button', { name: 'Add profile' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('hides Add profile without an admin profile', () => {
    setupTest([session('s2', 'user-2', 'Alex')]);
    expect(screen.queryByRole('button', { name: 'Add profile' })).not.toBeInTheDocument();
  });

  it('focuses the requested profile and moves between profiles with the remote', () => {
    setupTest(undefined, { focusUserId: 'user-2' });
    expect(screen.getByRole('button', { name: 'Alex' })).toHaveFocus();
  });

  it('goes back without switching, and has no back at startup', () => {
    const { onBack, onSelect } = setupTest();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onBack).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens the editor in manage mode and returns with the back rail', () => {
    const { onEdit, onDone, onSelect } = setupTest(undefined, { mode: 'manage' });

    expect(screen.getByRole('heading', { name: 'Manage profiles' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add profile' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ session: 's2' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    // Left from the profile crosses onto the rail, though it sits far higher.
    const placeAt = (name: string, top: number, left: number) => {
      screen.getByRole('button', { name }).getBoundingClientRect = () =>
        ({ top, left, width: 100, height: 100, right: left + 100, bottom: top + 100 }) as DOMRect;
    };
    placeAt('Edit Maurizio', 300, 400);
    placeAt('Edit Alex', 300, 600);
    placeAt('Back to Who’s watching', 20, 10);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Maurizio' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Back to Who’s watching' })).toHaveFocus();
    const rail = within(screen.getByRole('complementary', { name: 'Page navigation' }));
    fireEvent.click(rail.getByRole('button', { name: 'Back to Who’s watching' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the back rail only when there is somewhere to go back to', () => {
    const { onBack } = setupTest();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    cleanup();
    setupTest(undefined, { onBack: undefined });
    expect(screen.queryByRole('complementary', { name: 'Page navigation' })).toBeNull();
  });
});
