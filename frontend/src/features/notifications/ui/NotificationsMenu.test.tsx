import { NavigationProvider } from '@shared/navigation';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationUnreadItems as unreadItems } from '../notifications.fixtures';
import { NotificationsMenu, type NotificationsMenuProps } from './NotificationsMenu';

/** Every observer created, with the element it watches and whether it is still connected. */
let observers: { target: Element | null; connected: boolean }[] = [];

beforeEach(() => {
  observers = [];
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private entry = { target: null as Element | null, connected: true };
      constructor() {
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {
        this.entry.connected = false;
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const props = (
  focused: boolean,
  overrides: Partial<NotificationsMenuProps> = {}
): NotificationsMenuProps => ({
  unread: {
    items: unreadItems,
    loading: false,
    failed: false,
    hasMore: true,
    loadingMore: false,
    loadMore: vi.fn(),
    retry: vi.fn(),
  },
  read: { items: [], loading: false, hasMore: false, loadingMore: false, loadMore: vi.fn() },
  unreadCount: unreadItems.length,
  hasRead: false,
  showRead: false,
  focused,
  onToggleShowRead: vi.fn(),
  onMarkAllRead: vi.fn(),
  onOpen: vi.fn(),
  onExit: vi.fn(),
  onPointerEnter: vi.fn(),
  ...overrides,
});

const renderMenu = (menuProps: NotificationsMenuProps) => {
  const view = render(
    <NavigationProvider>
      <NotificationsMenu {...menuProps} />
    </NavigationProvider>
  );
  return (next: NotificationsMenuProps) =>
    view.rerender(
      <NavigationProvider>
        <NotificationsMenu {...next} />
      </NavigationProvider>
    );
};
const watching = () => observers.filter(observer => observer.connected && observer.target);

describe('NotificationsMenu', () => {
  it('keeps watching the page sentinel when the panel takes and gives back the keys', () => {
    const rerender = renderMenu(props(false));

    for (const focused of [true, false]) {
      rerender(props(focused));
      // Moving in or out of the focus scope replaces the sentinel: the live observer follows it
      expect(watching()).toHaveLength(1);
      expect(watching()[0]!.target?.isConnected).toBe(true);
    }
  });

  it('watches the read sentinel once it appears after the unread notifications run out', () => {
    const read = {
      items: unreadItems.map(item => ({ ...item, id: item.id + 1000, readAt: item.createdAt })),
      loading: false,
      hasMore: true,
      loadingMore: false,
      loadMore: vi.fn(),
    };
    const withUnread = (hasMore: boolean) =>
      props(false, {
        showRead: true,
        hasRead: true,
        read,
        unread: { ...props(false).unread, hasMore },
      });
    const rerender = renderMenu(withUnread(true));
    // Only the unread sentinel exists while unread pages remain
    expect(watching()).toHaveLength(1);
    const unreadSentinel = watching()[0]!.target;

    rerender(withUnread(false));

    expect(watching()).toHaveLength(1);
    expect(watching()[0]!.target).not.toBe(unreadSentinel);
    expect(watching()[0]!.target?.isConnected).toBe(true);
  });

  it('enters on Retry when notifications failed to load and none are unread', async () => {
    renderMenu(
      props(true, {
        unread: { ...props(true).unread, items: [], failed: true, hasMore: false },
        unreadCount: 0,
      })
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
  });
});
