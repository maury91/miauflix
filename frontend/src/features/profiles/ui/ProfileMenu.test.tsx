import { NavigationProvider } from '@shared/navigation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileMenu } from './ProfileMenu';

vi.mock('@features/profiles/avatar/ProfileAvatar', () => ({ ProfileAvatar: () => null }));

const profile = {
  session: 'session-1',
  user: {
    id: 'user-1',
    email: 'maurizio@example.com',
    displayName: 'Maurizio',
    role: 'user' as const,
    avatar: null,
    avatarVersion: null,
  },
};

const setupTest = (focused = true) => {
  const handlers = {
    onSwitch: vi.fn(),
    onEdit: vi.fn(),
    onPreferences: vi.fn(),
    onLogout: vi.fn(),
    onExit: vi.fn(),
    onPointerEnter: vi.fn(),
  };
  render(
    <NavigationProvider>
      <ProfileMenu profile={profile} focused={focused} {...handlers} />
    </NavigationProvider>
  );
  return handlers;
};

beforeEach(() => {
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

describe('ProfileMenu', () => {
  it('shows who is watching and its options', () => {
    setupTest(false);
    const panel = screen.getByRole('region', { name: 'Profile' });
    expect(panel).toHaveTextContent('Maurizio');
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Switch profile',
      'Edit profile',
      'Preferences',
      'Sign out',
    ]);
  });

  it('lands on Switch profile, moves with Up and Down and confirms with Enter', () => {
    const { onSwitch, onEdit, onPreferences, onLogout } = setupTest();
    const switchProfile = screen.getByRole('button', { name: 'Switch profile' });
    const editProfile = screen.getByRole('button', { name: 'Edit profile' });
    const preferences = screen.getByRole('button', { name: 'Preferences' });
    const logout = screen.getByRole('button', { name: 'Sign out' });
    expect(switchProfile).toHaveFocus();

    press('ArrowDown');
    expect(editProfile).toHaveFocus();
    press('Enter');
    expect(onEdit).toHaveBeenCalledTimes(1);
    press('ArrowDown');
    expect(preferences).toHaveFocus();
    press('Enter');
    expect(onPreferences).toHaveBeenCalledTimes(1);
    press('ArrowDown');
    expect(logout).toHaveFocus();
    // The last option stays put
    press('ArrowDown');
    expect(logout).toHaveFocus();
    press('Enter');
    expect(onLogout).toHaveBeenCalledTimes(1);

    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(switchProfile).toHaveFocus();
    press('Enter');
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it.each(['ArrowLeft', 'Escape'])('hands the keyboard back to the rail with %s', key => {
    const { onExit } = setupTest();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Switch profile' }), { key });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
