import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    onLogout: vi.fn(),
    onExit: vi.fn(),
    onPointerEnter: vi.fn(),
    onPointerLeave: vi.fn(),
  };
  render(<ProfileMenu profile={profile} focused={focused} railExpanded {...handlers} />);
  return handlers;
};

describe('ProfileMenu', () => {
  it('shows who is watching and its options', () => {
    setupTest(false);
    const panel = screen.getByRole('region', { name: 'Profile' });
    expect(panel).toHaveTextContent('Maurizio');
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Switch profile',
      'Edit profile',
      'Logout',
    ]);
  });

  it('lands on Switch profile, moves with Up and Down and confirms with Enter', () => {
    const { onSwitch, onEdit, onLogout } = setupTest();
    const switchProfile = screen.getByRole('button', { name: 'Switch profile' });
    const editProfile = screen.getByRole('button', { name: 'Edit profile' });
    expect(switchProfile).toHaveFocus();

    const logout = screen.getByRole('button', { name: 'Logout' });
    fireEvent.keyDown(switchProfile, { key: 'ArrowDown' });
    expect(editProfile).toHaveFocus();
    fireEvent.keyDown(editProfile, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(editProfile, { key: 'ArrowDown' });
    expect(logout).toHaveFocus();
    // The last option stays put
    fireEvent.keyDown(logout, { key: 'ArrowDown' });
    expect(logout).toHaveFocus();
    fireEvent.keyDown(logout, { key: 'Enter' });
    expect(onLogout).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(logout, { key: 'ArrowUp' });

    fireEvent.keyDown(editProfile, { key: 'ArrowUp' });
    fireEvent.keyDown(switchProfile, { key: 'Enter' });
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it.each(['ArrowLeft', 'Escape'])('hands the keyboard back to the rail with %s', key => {
    const { onExit } = setupTest();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Switch profile' }), { key });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
