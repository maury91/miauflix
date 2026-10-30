import { fn } from 'storybook/test';

// Realtime middleware resets this cache on session change; stories only need the utility.
export const notificationsApi = {
  util: {
    resetApiState: fn().mockName('notificationsApi.util.resetApiState'),
    invalidateTags: fn().mockName('notificationsApi.util.invalidateTags'),
  },
};

const emptyPages = {
  data: { pages: [{ notifications: [], nextCursor: null }], pageParams: [null] },
  isLoading: false,
  isFetching: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: fn(),
  refetch: fn(),
};

export const useGetNotificationsInfiniteQuery = fn().mockReturnValue(emptyPages);
export const useGetNotificationCountsQuery = fn().mockReturnValue({
  data: { unreadCount: 0, hasRead: false },
  isLoading: false,
  isError: false,
  refetch: fn(),
});
export const useMarkNotificationReadMutation = fn().mockReturnValue([fn(), { isLoading: false }]);
export const useMarkAllNotificationsReadMutation = fn().mockReturnValue([
  fn(),
  { isLoading: false },
]);
export const useRequestAvailabilityMutation = fn().mockReturnValue([
  fn().mockReturnValue({ unwrap: fn().mockResolvedValue({ requested: true }) }),
  { isLoading: false, isSuccess: false },
]);
