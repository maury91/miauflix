import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { Badge, Button, Heading, List, ListItem, Text } from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { artworkUrl } from '@shared/lib/media.utils';
import { formatRelativeTime } from '@shared/lib/relative-time';
import { FocusScope, useActiveIdWithin, useNavigation } from '@shared/navigation';
import { type FC, type ReactNode, type RefObject, useEffect, useRef } from 'react';

import { notificationCopy } from '../lib/notification-copy';
import * as styles from './notificationsMenu.css';

import BellIcon from '~icons/mdi/bell-outline';

/** Marks the panel, so the rail can tell the pointer moved onto it rather than away. */
export const NOTIFICATIONS_PANEL_ATTRIBUTE = 'data-notifications-panel';

const POSTER_SIZE = 84;

/** Navigation ids of the panel's scope and controls. */
const NOTIFICATIONS_NAV = {
  scope: 'notifications',
  markAll: 'notifications:mark-all',
  retry: 'notifications:retry',
  showRead: 'notifications:show-read',
  row: (id: number | string) => `notifications:row:${id}`,
} as const;

interface NotificationStream {
  items: NotificationItem[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

export interface NotificationsMenuProps {
  unread: NotificationStream & { loading: boolean; failed: boolean; retry: () => void };
  read: NotificationStream & { loading: boolean };
  unreadCount: number;
  /** Whether read notifications exist, so the "show read" button is worth offering. */
  hasRead: boolean;
  showRead: boolean;
  /**
   * The keyboard is in the panel (rather than on the rail): its controls become a contained
   * navigation scope, entered at the newest notification.
   */
  focused: boolean;
  onToggleShowRead: () => void;
  onMarkAllRead: () => void;
  onOpen: (notification: NotificationItem) => void;
  /** Left or Back: hand the keyboard back to the rail, keeping the panel open. */
  onExit: () => void;
  /** The pointer moved onto the panel. Leaving it is the rail's: the panel sits in its flyout. */
  onPointerEnter: () => void;
}

/** Calls `onVisible` whenever the sentinel scrolls into the list's view. */
function useSentinel(root: RefObject<HTMLElement | null>, enabled: boolean, onVisible: () => void) {
  const sentinel = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const target = sentinel.current;
    if (!enabled || !target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) callback.current();
      },
      { root: root.current, rootMargin: '0px 0px 200px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, root]);
  return sentinel;
}

const NotificationRow: FC<{
  notification: NotificationItem;
  navId?: string;
  onOpen: (notification: NotificationItem) => void;
}> = ({ notification, navId, onOpen }) => {
  const copy = notificationCopy(notification);
  const unread = !notification.readAt;
  const poster = notification.poster ? artworkUrl(notification.poster, 'card', POSTER_SIZE) : null;
  return (
    <ListItem
      navId={navId}
      leading={
        <span className={styles.poster}>
          {poster ? (
            <img className={styles.posterImage} src={poster} alt="" loading="lazy" />
          ) : (
            <BellIcon />
          )}
        </span>
      }
      title={copy.heading}
      description={
        <>
          {notification.title}. {copy.text}
          {copy.qualityLabel && (
            <span className={styles.inlineBadge}>
              <Badge>{copy.qualityLabel}</Badge>
            </span>
          )}
          {copy.release && ` ${copy.release}`}
          {copy.qualityLabel && !copy.release && '.'}
          <time className={styles.time} dateTime={notification.createdAt}>
            {formatRelativeTime(notification.createdAt)}
          </time>
        </>
      }
      metadata={unread ? <Badge accessibleLabel="Unread">New</Badge> : undefined}
      onClick={() => onOpen(notification)}
    />
  );
};

/**
 * The notifications panel beside the rail: unread first, read on request, paged as it scrolls.
 * Rows are ListItems; while the panel has the keyboard it is a contained scope of the navigation
 * layer (Up/Down move, OK opens, reaching the last row loads the next page); Left or Back hand the
 * keyboard back to the rail.
 */
export const NotificationsMenu: FC<NotificationsMenuProps> = ({
  unread,
  read,
  unreadCount,
  hasRead,
  showRead,
  focused,
  onToggleShowRead,
  onMarkAllRead,
  onOpen,
  onExit,
  onPointerEnter,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const { focus, lastInput } = useNavigation();
  const unreadSentinel = useSentinel(
    listRef,
    unread.hasMore && !unread.loadingMore,
    unread.loadMore
  );
  const readSentinel = useSentinel(
    listRef,
    showRead && read.hasMore && !read.loadingMore,
    read.loadMore
  );
  const keysRef = useKeyboardNavigation({
    enabled: focused,
    onLeft: () => {
      onExit();
      return true;
    },
    onBack: () => {
      onExit();
      return true;
    },
    onRight: () => true,
  });

  const unreadExhausted = !unread.hasMore;
  const lastUnread = unread.items[unread.items.length - 1];
  const lastRead = read.items[read.items.length - 1];
  // Only an open panel registers its controls, so the rail never moves into it
  const nav = (id: string) => (focused ? id : undefined);
  const firstId = unread.items[0]
    ? NOTIFICATIONS_NAV.row(unread.items[0].id)
    : unreadCount > 0
      ? NOTIFICATIONS_NAV.markAll
      : NOTIFICATIONS_NAV.showRead;

  // The panel scrolls natively: keep a row reached by key in view, and load the next page when the
  // last loaded row of a stream is reached
  const active = useActiveIdWithin(focused ? NOTIFICATIONS_NAV.scope : undefined);
  useEffect(() => {
    if (active === null) return;
    if (lastInput() === 'key')
      listRef.current
        ?.querySelector<HTMLElement>('[data-focused]')
        ?.scrollIntoView?.({ block: 'nearest' });
    if (lastUnread && unread.hasMore && active === NOTIFICATIONS_NAV.row(lastUnread.id))
      unread.loadMore();
    if (lastRead && read.hasMore && active === NOTIFICATIONS_NAV.row(lastRead.id)) read.loadMore();
    // Only a focus move scrolls or pages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Entered before the first page arrived (on Mark all as read, or nothing): take the newest
  // notification once it does, unless focus already moved on
  const enteredEmpty = useRef(false);
  useEffect(() => {
    if (!focused) {
      enteredEmpty.current = false;
      return;
    }
    const first = unread.items[0];
    if (!first) {
      enteredEmpty.current = true;
      if (active === null) focus(NOTIFICATIONS_NAV.scope);
      return;
    }
    if (!enteredEmpty.current) return;
    enteredEmpty.current = false;
    if (active === null || active === NOTIFICATIONS_NAV.markAll)
      focus(NOTIFICATIONS_NAV.row(first.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, unread.items.length]);

  const content: ReactNode = (
    <>
      <header className={styles.header}>
        <Heading level={2} variant="heading">
          Notifications
        </Heading>
        {unreadCount > 0 && (
          <Button navId={nav(NOTIFICATIONS_NAV.markAll)} size="sm" onClick={onMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </header>
      <div ref={listRef} className={styles.list} aria-live="polite">
        {unread.failed ? (
          <div className={styles.message}>
            <Text tone="secondary">Notifications could not be loaded.</Text>{' '}
            <Button navId={nav(NOTIFICATIONS_NAV.retry)} size="sm" onClick={unread.retry}>
              Retry
            </Button>
          </div>
        ) : unread.loading && !unread.items.length ? (
          <p className={styles.message}>
            <Text tone="secondary">Loading notifications…</Text>
          </p>
        ) : (
          <>
            {unread.items.length > 0 && (
              <List label="Unread notifications" divided>
                {unread.items.map(notification => (
                  <NotificationRow
                    key={notification.id}
                    navId={nav(NOTIFICATIONS_NAV.row(notification.id))}
                    notification={notification}
                    onOpen={onOpen}
                  />
                ))}
              </List>
            )}
            {unread.hasMore && <div ref={unreadSentinel} className={styles.sentinel} />}
            {unread.loadingMore && (
              <p className={styles.message}>
                <Text tone="secondary">Loading more…</Text>
              </p>
            )}
            {!unread.items.length && (
              <p className={styles.message}>
                <Text tone="secondary">You’re all caught up.</Text>
              </p>
            )}
            {unreadExhausted && hasRead && (
              <div className={styles.showRead}>
                <Button
                  navId={nav(NOTIFICATIONS_NAV.showRead)}
                  size="sm"
                  aria-expanded={showRead}
                  onClick={onToggleShowRead}
                >
                  {showRead ? 'Hide read notifications' : 'Show read notifications'}
                </Button>
              </div>
            )}
            {unreadExhausted && showRead && read.items.length > 0 && (
              <List label="Read notifications" divided>
                {read.items.map(notification => (
                  <NotificationRow
                    key={notification.id}
                    navId={nav(NOTIFICATIONS_NAV.row(notification.id))}
                    notification={notification}
                    onOpen={onOpen}
                  />
                ))}
              </List>
            )}
            {unreadExhausted && showRead && read.hasMore && (
              <div ref={readSentinel} className={styles.sentinel} />
            )}
            {unreadExhausted && showRead && (read.loading || read.loadingMore) && (
              <p className={styles.message}>
                <Text tone="secondary">Loading more…</Text>
              </p>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <div
      ref={keysRef}
      className={styles.zone}
      {...{ [NOTIFICATIONS_PANEL_ATTRIBUTE]: '' }}
      onMouseEnter={onPointerEnter}
    >
      <section className={styles.panel} aria-label="Notifications">
        {focused ? (
          <FocusScope id={NOTIFICATIONS_NAV.scope} contain initialId={firstId}>
            {content}
          </FocusScope>
        ) : (
          content
        )}
      </section>
    </div>
  );
};
