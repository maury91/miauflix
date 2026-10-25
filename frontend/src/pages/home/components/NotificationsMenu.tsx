import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { RAIL_COLLAPSED_WIDTH_CSS, RAIL_EXPANDED_WIDTH_CSS } from '@shared/ui/rail/rail.styles';
import { type FC, useEffect, useRef } from 'react';
import styled from 'styled-components';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 19;
  background: rgba(0, 0, 0, 0.28);
`;

const Panel = styled.section<{ $sidebarActive: boolean }>`
  position: fixed;
  z-index: 20;
  top: 5vh;
  left: ${({ $sidebarActive }) =>
    `calc(${$sidebarActive ? RAIL_EXPANDED_WIDTH_CSS : RAIL_COLLAPSED_WIDTH_CSS} + 12px)`};
  width: min(380px, calc(100vw - 80px));
  max-height: 82vh;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  background: #171717;
  color: ${PALETTE.text.primary};
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 600;
`;

const CloseButton = styled.button`
  border: 0;
  padding: 6px 8px;
  border-radius: 7px;
  background: transparent;
  color: ${PALETTE.text.primary};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${PALETTE.text.primary};
  }
`;

const List = styled.div`
  max-height: calc(82vh - 62px);
  overflow: auto;
  padding: 8px;
`;

const Row = styled.button<{ $unread: boolean }>`
  display: block;
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 9px;
  background: ${({ $unread }) => ($unread ? 'rgba(230, 0, 25, 0.14)' : 'transparent')};
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    outline: none;
    background: rgba(255, 255, 255, 0.1);
  }

  strong,
  span,
  time {
    display: block;
  }

  span {
    margin-top: 4px;
    color: ${PALETTE.text.secondary};
    font-size: 0.88rem;
  }

  time {
    margin-top: 7px;
    color: ${PALETTE.text.muted};
    font-size: 0.75rem;
  }
`;

const Empty = styled.p`
  padding: 18px 12px;
  color: ${PALETTE.text.muted};
  text-align: center;
`;

interface NotificationsMenuProps {
  notifications: NotificationItem[];
  loading: boolean;
  failed: boolean;
  sidebarActive: boolean;
  onClose: () => void;
  onRetry: () => void;
  onMarkRead: (id: number) => void;
}

export const NotificationsMenu: FC<NotificationsMenuProps> = ({
  notifications,
  loading,
  failed,
  sidebarActive,
  onClose,
  onRetry,
  onMarkRead,
}) => {
  const panelRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (firstRef.current ?? panelRef.current)?.focus({ preventScroll: true });
  }, []);

  const navigationRef = useKeyboardNavigation({
    enabled: true,
    exclusive: true,
    onBack: () => {
      onClose();
      return true;
    },
  });

  return (
    <Backdrop onMouseDown={onClose}>
      <Panel
        ref={node => {
          panelRef.current = node;
          navigationRef(node);
        }}
        $sidebarActive={sidebarActive}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const buttons = [
            ...(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ??
              []),
          ];
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <Header>
          <span>Notifications</span>
          <CloseButton
            ref={firstRef}
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
          >
            Close
          </CloseButton>
        </Header>
        <List aria-live="polite">
          {failed ? (
            <Empty>
              Notifications could not be loaded.
              <CloseButton type="button" onClick={onRetry}>
                Retry
              </CloseButton>
            </Empty>
          ) : loading && !notifications.length ? (
            <Empty>Loading notifications…</Empty>
          ) : notifications.length ? (
            notifications.map(notification => (
              <Row
                key={notification.id}
                type="button"
                $unread={!notification.readAt}
                aria-label={`${notification.title}. ${notification.message}${notification.readAt ? '' : ', unread'}`}
                onClick={() => {
                  if (!notification.readAt) onMarkRead(notification.id);
                }}
              >
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                <time dateTime={notification.createdAt}>
                  {new Date(notification.createdAt).toLocaleString()}
                </time>
              </Row>
            ))
          ) : (
            <Empty>You’re all caught up.</Empty>
          )}
        </List>
      </Panel>
    </Backdrop>
  );
};
