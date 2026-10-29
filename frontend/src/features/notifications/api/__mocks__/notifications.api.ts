import { fn } from 'storybook/test';

// Realtime middleware resets this cache on session change; stories only need the utility.
export const notificationsApi = {
  util: {
    resetApiState: fn().mockName('notificationsApi.util.resetApiState'),
  },
};

const emptyNotifications = {
  data: { notifications: [], unreadCount: 0 },
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: fn(),
};

export const useGetNotificationsQuery = fn().mockReturnValue(emptyNotifications);
export const useMarkNotificationReadMutation = fn().mockReturnValue([fn(), { isLoading: false }]);
export const useRequestAvailabilityMutation = fn().mockReturnValue([
  fn().mockReturnValue({ unwrap: fn().mockResolvedValue({ requested: true }) }),
  { isLoading: false, isSuccess: false },
]);
