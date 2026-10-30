import {
  type NotificationItem,
  notificationsApi,
  useGetNotificationCountsQuery,
  useGetNotificationsInfiniteQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '@features/notifications/api/notifications.api';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { useSessionChange } from './useSessionChange';

const EMPTY: NotificationItem[] = [];

/**
 * The unread badge count, polled in the background, and the notifications panel's two paged
 * streams: unread first, read only once the user asks to see them.
 */
export function useHomeNotifications(sessionId: string | null, visible: boolean) {
  const dispatch = useDispatch<AppDispatch>();
  const [showRead, setShowRead] = useState(false);
  const counts = useGetNotificationCountsQuery(undefined, {
    skip: !sessionId,
    pollingInterval: 60_000,
  });
  // Re-subscribing when the panel shows refetches the pages already loaded.
  const unread = useGetNotificationsInfiniteQuery(
    { status: 'unread' },
    { skip: !sessionId || !visible, refetchOnMountOrArgChange: true }
  );
  const read = useGetNotificationsInfiniteQuery(
    { status: 'read' },
    { skip: !sessionId || !visible || !showRead, refetchOnMountOrArgChange: true }
  );
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();

  // Another account's notifications must not show; the mounted queries re-subscribe.
  useSessionChange(sessionId, () => {
    dispatch(notificationsApi.util.resetApiState());
  });

  // Read notifications start hidden every time the panel shows.
  useEffect(() => {
    if (!visible) setShowRead(false);
  }, [visible]);

  // A notification that arrives while the panel is open shows without waiting for a reopen.
  const unreadCount = counts.data?.unreadCount ?? 0;
  const lastUnreadCount = useRef(unreadCount);
  useEffect(() => {
    if (lastUnreadCount.current === unreadCount) return;
    lastUnreadCount.current = unreadCount;
    if (visible) dispatch(notificationsApi.util.invalidateTags(['Notifications']));
  }, [dispatch, unreadCount, visible]);

  const unreadItems = useMemo(
    () => unread.data?.pages.flatMap(page => page.notifications) ?? EMPTY,
    [unread.data]
  );
  const readItems = useMemo(
    () => (showRead ? (read.data?.pages.flatMap(page => page.notifications) ?? EMPTY) : EMPTY),
    [read.data, showRead]
  );

  const { fetchNextPage: fetchNextUnread } = unread;
  const { fetchNextPage: fetchNextRead } = read;
  const loadMoreUnread = useCallback(() => {
    if (unread.hasNextPage && !unread.isFetchingNextPage) void fetchNextUnread();
  }, [fetchNextUnread, unread.hasNextPage, unread.isFetchingNextPage]);
  const loadMoreRead = useCallback(() => {
    if (read.hasNextPage && !read.isFetchingNextPage) void fetchNextRead();
  }, [fetchNextRead, read.hasNextPage, read.isFetchingNextPage]);

  return {
    unreadCount,
    hasRead: counts.data?.hasRead ?? false,
    unread: {
      items: unreadItems,
      loading: unread.isLoading,
      failed: unread.isError,
      hasMore: !!unread.hasNextPage,
      loadingMore: unread.isFetchingNextPage,
      loadMore: loadMoreUnread,
      retry: () => void unread.refetch(),
    },
    read: {
      items: readItems,
      loading: read.isLoading,
      hasMore: !!read.hasNextPage,
      loadingMore: read.isFetchingNextPage,
      loadMore: loadMoreRead,
    },
    showRead,
    toggleShowRead: useCallback(() => setShowRead(value => !value), []),
    markRead: useCallback((id: number) => void markRead(id), [markRead]),
    markAllRead: useCallback(() => void markAllRead(), [markAllRead]),
  };
}

export type HomeNotifications = ReturnType<typeof useHomeNotifications>;
