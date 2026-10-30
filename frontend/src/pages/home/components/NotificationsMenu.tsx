import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { formatRelativeTime } from '@shared/lib/relative-time';
import { QualityBadge } from '@shared/ui/quality-badge/QualityBadge';
import { RAIL_COLLAPSED_WIDTH_CSS, RAIL_EXPANDED_WIDTH_CSS } from '@shared/ui/rail/rail.styles';
import { type FC, type MouseEvent, type RefObject, useEffect, useRef } from 'react';
import styled from 'styled-components';

import { artworkUrl } from '../media.utils';
import { notificationCopy } from '../notification-copy';

import BellIcon from '~icons/mdi/bell-outline';

/** Marks the panel, so the rail can tell the pointer moved onto it rather than away. */
export const NOTIFICATIONS_PANEL_ATTRIBUTE = 'data-notifications-panel';

const POSTER_SIZE = 84;

const Dim = styled.div`
  position: fixed;
  inset: 0;
  /* Below the rail and the app logo (1002). */
  z-index: 1001;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
`;

/**
 * Starts right at the rail's edge and at the top of the screen, so the pointer can travel from
 * the bell into the panel without crossing the page.
 */
const HoverZone = styled.div<{ $railExpanded: boolean }>`
  --rail-width: ${({ $railExpanded }) =>
    $railExpanded ? RAIL_EXPANDED_WIDTH_CSS : RAIL_COLLAPSED_WIDTH_CSS};
  position: fixed;
  /* Above the app logo (1002), which would otherwise sit on the panel's header. */
  z-index: 1003;
  top: 0;
  left: var(--rail-width);
  padding: 3vh 0 0 0;
  outline: none;
`;

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100vw - var(--rail-width) - 24px));
  max-height: 88vh;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: #151515;
  color: ${PALETTE.text.primary};
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 10px;

  h2 {
    margin: 0;
    font-family: inherit;
    font-size: 1.2rem;
    font-weight: 600;
    text-transform: none;
  }
`;

const PillButton = styled.button`
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: ${PALETTE.text.secondary};
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover,
  &:focus-visible,
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.12);
    color: ${PALETTE.text.primary};
  }
`;

const List = styled.div`
  overflow: auto;
  padding: 0 10px 12px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Row = styled.button`
  position: relative;
  display: grid;
  grid-template-columns: ${POSTER_SIZE}px minmax(0, 1fr) 10px;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 8px 14px 8px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  & + &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 10px;
    left: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  &:hover,
  &:focus,
  &:focus-visible {
    outline: none;
    background: rgba(255, 255, 255, 0.09);
  }

  &:hover::before,
  &:focus::before,
  &:hover + &::before,
  &:focus + &::before {
    border-color: transparent;
  }
`;

const Poster = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${POSTER_SIZE}px;
  height: ${POSTER_SIZE}px;
  overflow: hidden;
  border-radius: 6px;
  background: #262626;
  color: ${PALETTE.text.muted};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 28px;
    height: 28px;
  }
`;

const Text = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong {
    font-size: 0.95rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: ${PALETTE.text.secondary};
    font-size: 0.82rem;
    line-height: 1.45;
  }

  time {
    color: ${PALETTE.text.muted};
    font-size: 0.72rem;
  }
`;

const InlineBadge = styled(QualityBadge)`
  margin: 0 0.3em;
  font-size: 0.72rem;
  gap: 0.35rem;
`;

const UnreadDot = styled.span`
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e60019;
`;

const Message = styled.p`
  margin: 0;
  padding: 14px 12px;
  color: ${PALETTE.text.muted};
  font-size: 0.85rem;
  text-align: center;
`;

const ShowReadButton = styled(PillButton)`
  display: block;
  margin: 10px auto 4px;
`;

const Sentinel = styled.div`
  height: 1px;
`;

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
  /** The keyboard is in the panel (rather than on the rail). */
  focused: boolean;
  railExpanded: boolean;
  onToggleShowRead: () => void;
  onMarkAllRead: () => void;
  onOpen: (notification: NotificationItem) => void;
  /** Left or Back: hand the keyboard back to the rail, keeping the panel open. */
  onExit: () => void;
  onPointerEnter: () => void;
  /** The pointer left for the page (not the rail). */
  onPointerLeave: () => void;
}

const FOCUSABLE = '[data-notification-focusable]:not([disabled])';

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
  last?: 'read' | 'unread';
  onOpen: (notification: NotificationItem) => void;
}> = ({ notification, last, onOpen }) => {
  const copy = notificationCopy(notification);
  const unread = !notification.readAt;
  const poster = notification.poster ? artworkUrl(notification.poster, 'card', POSTER_SIZE) : null;
  const sentence = [copy.text, copy.qualityLabel, copy.release].filter(Boolean).join(' ');
  return (
    <Row
      type="button"
      data-notification-focusable=""
      data-notification-row=""
      data-last-of={last}
      aria-label={`${copy.heading}. ${notification.title}. ${sentence}${unread ? ', unread' : ''}`}
      onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
      onClick={() => onOpen(notification)}
    >
      <Poster>
        {poster ? <img src={poster} alt="" loading="lazy" /> : <BellIcon aria-hidden="true" />}
      </Poster>
      <Text>
        <strong>{copy.heading}</strong>
        <p>
          {copy.text}
          {copy.qualityLabel && (
            <InlineBadge label={copy.qualityLabel} sourceType={notification.sourceType} />
          )}
          {copy.release && ` ${copy.release}`}
          {copy.qualityLabel && !copy.release && '.'}
        </p>
        <time dateTime={notification.createdAt}>{formatRelativeTime(notification.createdAt)}</time>
      </Text>
      {unread ? <UnreadDot aria-hidden="true" /> : <span />}
    </Row>
  );
};

/** The notifications panel beside the rail: unread first, read on request, paged as it scrolls. */
export const NotificationsMenu: FC<NotificationsMenuProps> = ({
  unread,
  read,
  unreadCount,
  hasRead,
  showRead,
  focused,
  railExpanded,
  onToggleShowRead,
  onMarkAllRead,
  onOpen,
  onExit,
  onPointerEnter,
  onPointerLeave,
}) => {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  const focusables = () => [...(zoneRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];

  const focusItem = (element: HTMLElement | undefined) => {
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'nearest' });
    const last = element.dataset['lastOf'];
    if (last === 'unread') unread.loadMore();
    if (last === 'read') read.loadMore();
  };

  // Entering the panel lands on the newest notification, like the rail lands on its item.
  useEffect(() => {
    if (!focused) return;
    const zone = zoneRef.current;
    if (!zone || zone.contains(document.activeElement)) return;
    const firstRow = zone.querySelector<HTMLElement>('[data-notification-row]');
    (firstRow ?? focusables()[0] ?? zone).focus({ preventScroll: true });
    // Runs when the keyboard arrives, and once the first page loads.
  }, [focused, unread.items.length]);

  const move = (direction: -1 | 1) => {
    const items = focusables();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index === -1 ? items[0] : items[index + direction];
    focusItem(next);
    return true;
  };

  const navigationRef = useKeyboardNavigation({
    enabled: focused,
    onUp: () => move(-1),
    onDown: () => move(1),
    onLeft: () => {
      onExit();
      return true;
    },
    onBack: () => {
      onExit();
      return true;
    },
    onRight: () => true,
    onConfirm: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && zoneRef.current?.contains(active)) active.click();
      return true;
    },
  });

  const leftForRail = (event: MouseEvent) =>
    event.relatedTarget instanceof Element && !!event.relatedTarget.closest('[data-home-rail]');

  const lastUnread = unread.items[unread.items.length - 1];
  const lastRead = read.items[read.items.length - 1];
  const unreadExhausted = !unread.hasMore;

  return (
    <>
      <Dim aria-hidden="true" />
      <HoverZone
        ref={node => {
          zoneRef.current = node;
          navigationRef(node);
        }}
        {...{ [NOTIFICATIONS_PANEL_ATTRIBUTE]: '' }}
        $railExpanded={railExpanded}
        tabIndex={-1}
        onMouseEnter={onPointerEnter}
        onMouseLeave={event => {
          if (!leftForRail(event)) onPointerLeave();
        }}
      >
        <Panel aria-label="Notifications">
          <Header>
            <h2>Notifications</h2>
            {unreadCount > 0 && (
              <PillButton
                type="button"
                data-notification-focusable=""
                onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
                onClick={onMarkAllRead}
              >
                Mark all as read
              </PillButton>
            )}
          </Header>
          <List ref={listRef} aria-live="polite">
            {unread.failed ? (
              <Message>
                Notifications could not be loaded.{' '}
                <PillButton type="button" data-notification-focusable="" onClick={unread.retry}>
                  Retry
                </PillButton>
              </Message>
            ) : unread.loading && !unread.items.length ? (
              <Message>Loading notifications…</Message>
            ) : (
              <>
                {unread.items.map(notification => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    last={notification === lastUnread && unread.hasMore ? 'unread' : undefined}
                    onOpen={onOpen}
                  />
                ))}
                {unread.hasMore && <Sentinel ref={unreadSentinel} />}
                {unread.loadingMore && <Message>Loading more…</Message>}
                {!unread.items.length && <Message>You’re all caught up.</Message>}
                {unreadExhausted && hasRead && (
                  <ShowReadButton
                    type="button"
                    data-notification-focusable=""
                    aria-expanded={showRead}
                    onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
                    onClick={onToggleShowRead}
                  >
                    {showRead ? 'Hide read notifications' : 'Show read notifications'}
                  </ShowReadButton>
                )}
                {unreadExhausted &&
                  showRead &&
                  read.items.map(notification => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      last={notification === lastRead && read.hasMore ? 'read' : undefined}
                      onOpen={onOpen}
                    />
                  ))}
                {unreadExhausted && showRead && read.hasMore && <Sentinel ref={readSentinel} />}
                {unreadExhausted && showRead && (read.loading || read.loadingMore) && (
                  <Message>Loading more…</Message>
                )}
              </>
            )}
          </List>
        </Panel>
      </HoverZone>
    </>
  );
};
