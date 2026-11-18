import { NavigationProvider } from '@shared/navigation';
import { render } from '@testing-library/react';
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

const props = (focused: boolean): NotificationsMenuProps => ({
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
});

describe('NotificationsMenu', () => {
  it('keeps watching the page sentinel when the panel takes and gives back the keys', () => {
    const view = render(
      <NavigationProvider>
        <NotificationsMenu {...props(false)} />
      </NavigationProvider>
    );
    const watching = () => observers.filter(observer => observer.connected);

    for (const focused of [true, false]) {
      view.rerender(
        <NavigationProvider>
          <NotificationsMenu {...props(focused)} />
        </NavigationProvider>
      );
      // Moving in or out of the focus scope replaces the sentinel: the live observer follows it
      expect(watching()).toHaveLength(1);
      expect(watching()[0]!.target?.isConnected).toBe(true);
    }
  });
});
