import type { NotificationItem } from '@features/notifications/api/notifications.api';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

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
  railExpanded: true,
  onToggleShowRead: fn(),
  onMarkAllRead: fn(),
  onOpen: fn(),
  onExit: fn(),
  onPointerEnter: fn(),
  onPointerLeave: fn(),
};

const meta = {
  title: 'Home/Notifications Menu',
  component: NotificationsMenu,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div style={{ minHeight: '100vh', background: '#000' }}>
        <Story />
      </div>
    ),
  ],
  args: baseArgs,
} satisfies Meta<typeof NotificationsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unread: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const rows = canvas.getAllByRole('button', { name: /available/ });
    await expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(rows[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(args.onExit).toHaveBeenCalled();
    await userEvent.click(rows[2]);
    await expect(args.onOpen).toHaveBeenCalledWith(unreadItems[2]);
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
