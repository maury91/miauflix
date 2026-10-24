import {
  notificationsApi,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
} from '@features/notifications/api/notifications.api';
import type { AppDispatch } from '@store/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

import { useSessionChange } from './useSessionChange';

/** The notifications query, its overlay, and returning focus to the bell when it closes. */
export function useHomeNotifications(sessionId: string | null, browsing: boolean) {
  const dispatch = useDispatch<AppDispatch>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const query = useGetNotificationsQuery(undefined, {
    skip: !sessionId,
    pollingInterval: 60_000,
  });
  const [markRead] = useMarkNotificationReadMutation();

  // Another account's notifications must not show; the mounted query re-subscribes and polls.
  useSessionChange(sessionId, () => {
    dispatch(notificationsApi.util.resetApiState());
  });

  const openNotifications = useCallback(() => {
    setOpen(true);
    if (sessionId) void query.refetch();
  }, [query, sessionId]);

  const closeNotifications = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  }, []);

  // The overlay belongs to browsing; leaving Home closes it.
  useEffect(() => {
    if (!browsing) setOpen(false);
  }, [browsing]);

  return { buttonRef, open, query, markRead, openNotifications, closeNotifications };
}
