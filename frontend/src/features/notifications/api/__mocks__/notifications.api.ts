import { fn } from 'storybook/test';

const emptyNotifications = {
  data: { notifications: [], unreadCount: 0 },
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: fn(),
};

export const useGetNotificationsQuery = fn().mockReturnValue(emptyNotifications);
export const useMarkNotificationReadMutation = fn().mockReturnValue([fn(), { isLoading: false }]);
