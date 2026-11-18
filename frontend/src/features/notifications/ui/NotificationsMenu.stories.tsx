import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { NavigationProvider } from '@shared/navigation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, waitFor, within } from 'storybook/test';

import {
  notificationReadItems as readItems,
  notificationUnreadItems as unreadItems,
} from '../notifications.fixtures';
import { NotificationsMenu, type NotificationsMenuProps } from './NotificationsMenu';

const stream = (items: NotificationItem[]) => ({
  items,
  loading: false,
  failed: false,
  hasMore: false,
  loadingMore: false,
  loadMore: fn(),
  retry: fn(),
});

const baseArgs: NotificationsMenuProps = {
  unread: stream(unreadItems),
  read: stream([]),
  unreadCount: unreadItems.length,
  hasRead: true,
  showRead: false,
  focused: true,
  onToggleShowRead: fn(),
  onMarkAllRead: fn(),
  onOpen: fn(),
  onExit: fn(),
  onPointerEnter: fn(),
};

const meta = {
  title: 'Home/Notifications Menu',
  component: NotificationsMenu,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <NavigationProvider>
        <div style={{ minHeight: '100vh', background: '#000' }}>
          <Story />
        </div>
      </NavigationProvider>
    ),
  ],
  args: baseArgs,
} satisfies Meta<typeof NotificationsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const rows = within(canvas.getByRole('list', { name: 'Unread notifications' })).getAllByRole(
      'button'
    );
    await expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(rows[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.onExit).toHaveBeenCalled();
    await userEvent.click(rows[2]);
    await expect(args.onOpen).toHaveBeenCalledWith(unreadItems[2]);
  },
};

/** Entered while the first page loads; the unread count is known, so Mark all as read shows. */
function ArrivingLater(args: NotificationsMenuProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setItems(unreadItems), 100);
    return () => clearTimeout(timer);
  }, []);
  return <NotificationsMenu {...args} unread={{ ...stream(items), loading: items.length === 0 }} />;
}

/** Entered before the first page arrived: it lands on Mark all, then moves to the newest row. */
export const EnteredWhileLoading: Story = {
  render: args => <ArrivingLater {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Mark all as read' })).toHaveFocus();
    await waitFor(() =>
      expect(
        within(canvas.getByRole('list', { name: 'Unread notifications' })).getAllByRole('button')[0]
      ).toHaveFocus()
    );
  },
};

export const WithReadShown: Story = {
  args: { showRead: true, read: stream(readItems) },
};

export const AllCaughtUp: Story = {
  args: { unread: stream([]), unreadCount: 0, hasRead: true },
};

/** No play function: the first notification keeps the keyboard highlight, like the design. */
export const UnreadVisual: Story = {};

export const LoadingMore: Story = {
  args: { unread: { ...stream(unreadItems), hasMore: true, loadingMore: true } },
};
