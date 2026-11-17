import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WhosWatchingPage, { type WhosWatchingPageProps } from './WhosWatchingPage';

vi.mock('@features/profiles/avatar/runtime', () => ({
  liveAvatarsSupported: () => false,
  loadPlushies: () => new Promise(() => undefined),
}));

beforeEach(() => {
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

/** Lays the profiles out in one row, for the spatial group. */
const placeInRow = (names: string[]) =>
  names.forEach((name, index) => {
    const left = 200 + index * 200;
    screen.getByRole('button', { name }).getBoundingClientRect = () =>
      ({ top: 300, left, width: 160, height: 200, right: left + 160, bottom: 500 }) as DOMRect;
  });

/** The tiles in a row and the edit button under its tile, for the spatial group. */
const place = () => {
  placeInRow(['Maurizio', 'Alex', 'Add profile']);
  screen.queryAllByRole('button', { name: /^Edit / }).forEach(button => {
    const tile = screen.getByRole('button', { name: button.getAttribute('aria-label')!.slice(5) });
    const { left } = tile.getBoundingClientRect();
    button.getBoundingClientRect = () =>
      ({
        top: 520,
        left: left + 60,
        width: 40,
        height: 40,
        right: left + 100,
        bottom: 560,
      }) as DOMRect;
  });
};

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
    placeInRow(['Maurizio', 'Alex', 'Add profile']);
    press('ArrowRight');
    expect(screen.getByRole('button', { name: 'Add profile' })).toHaveAttribute('data-focused');
  });

  it('goes back without switching, and has no back at startup', () => {
    const { onBack, onSelect } = setupTest();
    press('Escape');
    expect(onBack).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows an edit button under the focused profile only, reached with Down', () => {
    const { onEdit, onSelect } = setupTest();
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Edit Maurizio' })).toBeInTheDocument();
    place();
    press('ArrowRight');
    expect(screen.queryByRole('button', { name: 'Edit Maurizio' })).toBeNull();
    place();
    press('ArrowDown');
    const edit = screen.getByRole('button', { name: 'Edit Alex' });
    expect(edit).toHaveAttribute('data-focused');
    press('Enter');
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ session: 's2' }));
    expect(onSelect).not.toHaveBeenCalled();
    // Up returns to the profile; Add profile has no edit button
    press('ArrowUp');
    expect(screen.getByRole('button', { name: 'Alex' })).toHaveAttribute('data-focused');
    place();
    press('ArrowRight');
    expect(screen.queryAllByRole('button', { name: /^Edit / })).toHaveLength(0);
  });

  it('reaches Back on the rail with Left from the first profile', () => {
    const { onBack } = setupTest();
    place();
    press('ArrowLeft');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('data-focused');
    press('Enter');
    expect(onBack).toHaveBeenCalled();
  });

  it('shows the back rail only when there is somewhere to go back to', () => {
    const { onBack } = setupTest();
    const rail = within(screen.getByRole('navigation', { name: 'Profiles' }));
    fireEvent.click(rail.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    cleanup();
    setupTest(undefined, { onBack: undefined });
    expect(screen.queryByRole('navigation', { name: 'Profiles' })).toBeNull();
  });
});
