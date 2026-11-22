import { FocusScope, NavigationProvider } from '@shared/navigation';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeSidebar } from './HomeSidebar';

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

const sidebar = (overrides: Partial<Parameters<typeof HomeSidebar>[0]> = {}) => (
  <NavigationProvider>
    <FocusScope initialId="home-rail:search">
      <HomeSidebar
        showSettings={false}
        onEnterSettings={vi.fn()}
        onSearch={vi.fn()}
        onEnterNotifications={vi.fn()}
        onPointerLeave={vi.fn()}
        unreadCount={0}
        {...overrides}
      />
    </FocusScope>
  </NavigationProvider>
);

const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });

const rail = () => screen.getByRole('navigation', { name: 'Home navigation' });

describe('HomeSidebar', () => {
  it('keeps Search and the Settings panel reachable, without a Home item, when the rail is compact', () => {
    const onEnterSettings = vi.fn();
    const onSearch = vi.fn();
    render(sidebar({ showSettings: true, onEnterSettings, onSearch }));

    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onEnterSettings).toHaveBeenCalledTimes(1);
  });

  it('hides Settings when showSettings is false', () => {
    render(sidebar());
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('starts on Search, moves with Up and Down without wrapping, and expands while it holds focus', () => {
    render(sidebar({ showSettings: true }));
    const search = screen.getByRole('button', { name: 'Search' });
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute('data-focused');

    press('ArrowUp');
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus();
    press('ArrowUp');
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus();
    press('ArrowDown');
    press('ArrowDown');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    press('ArrowDown');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
  });

  it('expands while the pointer is over it and reports when the pointer leaves', () => {
    const onPointerLeave = vi.fn();
    render(
      <NavigationProvider>
        <HomeSidebar
          showSettings={false}
          onEnterSettings={vi.fn()}
          onSearch={vi.fn()}
          onEnterNotifications={vi.fn()}
          onPointerLeave={onPointerLeave}
          unreadCount={0}
        />
      </NavigationProvider>
    );

    const nav = rail();
    expect(nav).not.toHaveAttribute('data-expanded');
    fireEvent.mouseEnter(nav);
    expect(nav).toHaveAttribute('data-expanded');
    fireEvent.mouseLeave(nav);
    expect(nav).not.toHaveAttribute('data-expanded');
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
  });

  it('stays expanded with an open panel, drawn beside it in the flyout', () => {
    render(sidebar({ openPanel: 'notifications', flyout: <section aria-label="Panel" /> }));

    expect(rail()).toHaveAttribute('data-expanded');
    expect(rail()).toContainElement(screen.getByRole('region', { name: 'Panel' }));
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('opens the notifications panel from the bell and shows the unread count', () => {
    const onEnterNotifications = vi.fn();
    render(sidebar({ onEnterNotifications, unreadCount: 120 }));

    expect(screen.getByText('99+')).toBeInTheDocument();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(bell).toHaveAccessibleDescription('120 unread');
    fireEvent.click(bell);
    expect(onEnterNotifications).toHaveBeenCalledTimes(1);
  });

  it('puts the watching profile at the bottom, above Settings, and opens its panel', () => {
    const onEnterProfile = vi.fn();
    render(sidebar({ profile, onEnterProfile, showSettings: true }));

    const names = screen
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Notifications', 'Search', 'Profile for Maurizio', 'Settings']);
    fireEvent.click(screen.getByRole('button', { name: /^Profile/ }));
    expect(onEnterProfile).toHaveBeenCalledTimes(1);
  });

  it('opens the profile panel with Enter', () => {
    const onEnterProfile = vi.fn();
    render(sidebar({ profile, onEnterProfile }));
    press('ArrowDown');
    expect(screen.getByRole('button', { name: /^Profile/ })).toHaveFocus();
    press('Enter');
    expect(onEnterProfile).toHaveBeenCalledTimes(1);
  });
});
