import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { type FC, type Ref, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import type { HomeAction, NavigationOutcome } from '../homeNavigation';

import NotificationsIcon from '~icons/mdi/bell-outline';
import SettingsIcon from '~icons/mdi/cog-outline';
import HomeIcon from '~icons/mdi/home-outline';

type SidebarItem = 'notifications' | 'home' | 'settings';

const Rail = styled.aside<{ $active: boolean }>`
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 5;
  width: ${({ $active }) => ($active ? '15vw' : '5vw')};
  min-width: 56px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.72));
  transition: width 180ms ease;

  &::after {
    content: '';
    position: absolute;
    inset: 0 -1vw 0 auto;
    width: 1vw;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.7), transparent);
    pointer-events: none;
  }
`;

const Navigation = styled.nav`
  position: absolute;
  top: 5vh;
  bottom: 6vh;
  left: 0.65vw;
  right: 0.65vw;
  display: grid;
  align-content: space-between;
`;

const Item = styled.button<{ $active: boolean; $selected: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8vw;
  justify-content: ${({ $active }) => ($active ? 'flex-start' : 'center')};
  width: 100%;
  min-height: 0;
  min-width: 44px;
  height: clamp(42px, 3.7vw, 62px);
  padding: 0 0.8vw;
  border: 0;
  border-radius: clamp(8px, 0.5vw, 12px);
  background: ${({ $selected }) =>
    $selected ? 'linear-gradient(115deg, #e60019 0%, #870d1a 100%)' : 'transparent'};
  color: ${PALETTE.text.primary};
  font:
    500 clamp(0.8rem, 1.8vw, 1.5rem) 'Poppins',
    sans-serif;
  letter-spacing: 0;
  white-space: nowrap;
  text-align: left;
  cursor: pointer;
  outline: none;
  transition:
    background 140ms ease,
    box-shadow 140ms ease;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${PALETTE.text.primary};
  }
`;

const Icon = styled.span`
  display: inline-grid;
  flex: 0 0 1.35em;
  width: 1.35em;
  height: 1.35em;
  place-items: center;
  color: currentColor;
  font-size: 1.05em;
  line-height: 1;

  > svg {
    display: block;
    width: 28px;
    height: 28px;
  }
`;

const UnreadBadge = styled.span`
  position: absolute;
  top: 4px;
  left: 2.15em;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: #e60019;
  color: white;
  font-size: 0.66rem;
  line-height: 17px;
  text-align: center;
`;

interface HomeSidebarProps {
  active: boolean;
  onAction: (action: HomeAction) => NavigationOutcome;
  onHover: () => void;
  onSettings: () => void;
  onNotifications: () => void;
  notificationsRef: Ref<HTMLButtonElement>;
  unreadCount: number;
}

/** Render the primary Home actions and restore the selected button when the rail activates. */
export const HomeSidebar: FC<HomeSidebarProps> = ({
  active,
  onAction,
  onHover,
  onSettings,
  onNotifications,
  notificationsRef,
  unreadCount,
}) => {
  const [selected, setSelected] = useState<SidebarItem>('home');
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const homeRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  const order: SidebarItem[] = ['notifications', 'home', 'settings'];
  const focusSelected = (item: SidebarItem) => {
    if (item === 'notifications') notificationsButtonRef.current?.focus({ preventScroll: true });
    if (item === 'home') homeRef.current?.focus({ preventScroll: true });
    if (item === 'settings') settingsRef.current?.focus({ preventScroll: true });
  };
  const focus = (item: SidebarItem) => {
    setSelected(item);
    onHover();
    focusSelected(item);
  };

  useEffect(() => {
    if (active) {
      if (selected === 'notifications')
        notificationsButtonRef.current?.focus({ preventScroll: true });
      else if (selected === 'home') homeRef.current?.focus({ preventScroll: true });
      else settingsRef.current?.focus({ preventScroll: true });
    }
  }, [active, selected]);

  const move = (next: SidebarItem) => {
    setSelected(next);
    onHover();
  };

  const step = (direction: -1 | 1) => {
    const index = order.indexOf(selected);
    const next = order[(index + direction + order.length) % order.length];
    focus(next);
  };

  const navigationRef = useKeyboardNavigation({
    enabled: active,
    onDown: () => {
      step(1);
      return true;
    },
    onUp: () => {
      step(-1);
      return true;
    },
    onLeft: () => {
      step(-1);
      return true;
    },
    onRight: () => {
      onAction('right');
      return true;
    },
    onConfirm: () => {
      if (selected === 'settings') onSettings();
      else if (selected === 'notifications') onNotifications();
      else onAction('confirm');
      return true;
    },
    onBack: () => {
      onAction('back');
      return true;
    },
  });

  return (
    <Rail
      ref={navigationRef}
      $active={active}
      aria-label="Home navigation"
      onMouseEnter={onHover}
      onMouseLeave={() => {
        if (active) onAction('right');
      }}
    >
      <Navigation>
        <Item
          ref={element => {
            notificationsButtonRef.current = element;
            if (typeof notificationsRef === 'function') notificationsRef(element);
            else if (notificationsRef) notificationsRef.current = element;
          }}
          type="button"
          $active={active}
          $selected={selected === 'notifications'}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          aria-haspopup="dialog"
          onFocus={() => move('notifications')}
          onMouseEnter={() => move('notifications')}
          onClick={onNotifications}
        >
          <Icon aria-hidden="true">
            <NotificationsIcon />
          </Icon>
          {unreadCount > 0 && (
            <UnreadBadge aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</UnreadBadge>
          )}
          {active && <span>Notifications</span>}
        </Item>
        <Item
          ref={homeRef}
          type="button"
          $active={active}
          $selected={selected === 'home'}
          aria-label="Home"
          aria-current="page"
          onFocus={() => move('home')}
          onMouseEnter={() => move('home')}
          onClick={() => onAction('confirm')}
        >
          <Icon aria-hidden="true">
            <HomeIcon />
          </Icon>
          {active && <span>Home</span>}
        </Item>
        <Item
          ref={settingsRef}
          type="button"
          $active={active}
          $selected={selected === 'settings'}
          aria-label="Settings"
          onFocus={() => move('settings')}
          onMouseEnter={() => move('settings')}
          onClick={onSettings}
        >
          <Icon aria-hidden="true">
            <SettingsIcon />
          </Icon>
          {active && <span>Settings</span>}
        </Item>
      </Navigation>
    </Rail>
  );
};
