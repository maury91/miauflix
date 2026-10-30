import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import {
  Rail,
  RailIcon as Icon,
  RailItem as Item,
  RailNavigation as Navigation,
} from '@shared/ui/rail/rail.styles';
import { type FC, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import type { HomeAction, NavigationOutcome } from '../homeNavigation';
import { NOTIFICATIONS_PANEL_ATTRIBUTE } from './NotificationsMenu';

import NotificationsIcon from '~icons/mdi/bell-outline';
import SettingsIcon from '~icons/mdi/cog-outline';
import SearchIcon from '~icons/mdi/magnify';

export type SidebarItem = 'notifications' | 'search' | 'settings';

const UnreadBadge = styled.span`
  position: absolute;
  top: 4px;
  left: 2.15em;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: #e60019;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.85);
  color: white;
  font-size: 0.66rem;
  line-height: 17px;
  text-align: center;
`;

const EmptySpace = styled.div`
  flex: 1;
`;

interface HomeSidebarProps {
  active: boolean;
  showSettings: boolean;
  onAction: (action: HomeAction) => NavigationOutcome;
  onHover: () => void;
  onSettings: () => void;
  onSearch: () => void;
  /** Move the keyboard into the notifications panel. */
  onEnterNotifications: () => void;
  /** The item under the rail's highlight; the notifications panel shows while it is the bell. */
  onSelectedChange?: (item: SidebarItem) => void;
  /** Keep the rail expanded (e.g. while the notifications panel beside it is in use). */
  expanded?: boolean;
  unreadCount: number;
}

/** Render the primary Home actions and restore the selected button when the rail activates. */
export const HomeSidebar: FC<HomeSidebarProps> = ({
  active,
  showSettings,
  onAction,
  onHover,
  onSettings,
  onSearch,
  onEnterNotifications,
  onSelectedChange,
  expanded = false,
  unreadCount,
}) => {
  const open = active || expanded;
  const [selected, setSelected] = useState<SidebarItem>('search');
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  const order: SidebarItem[] = showSettings
    ? ['notifications', 'search', 'settings']
    : ['notifications', 'search'];
  const focusSelected = (item: SidebarItem) => {
    if (item === 'notifications') notificationsButtonRef.current?.focus({ preventScroll: true });
    if (item === 'search') searchRef.current?.focus({ preventScroll: true });
    if (item === 'settings') settingsRef.current?.focus({ preventScroll: true });
  };
  const focus = (item: SidebarItem) => {
    setSelected(item);
    onHover();
    focusSelected(item);
  };

  // Settings can disappear (e.g. admin rights change); never keep a hidden item selected.
  useEffect(() => {
    if (!showSettings && selected === 'settings') setSelected('search');
  }, [showSettings, selected]);

  useEffect(() => {
    onSelectedChange?.(selected);
  }, [onSelectedChange, selected]);

  useEffect(() => {
    if (active) focusSelected(selected);
    // focusSelected only reads refs.
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
      if (selected === 'notifications') onEnterNotifications();
      else onAction('right');
      return true;
    },
    onConfirm: () => {
      if (selected === 'settings' && showSettings) onSettings();
      else if (selected === 'notifications') onEnterNotifications();
      else onSearch();
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
      $active={open}
      aria-label="Home navigation"
      data-home-rail=""
      onMouseEnter={onHover}
      onMouseLeave={event => {
        // Moving onto the notifications panel keeps it (and the rail) open.
        const target = event.relatedTarget;
        if (target instanceof Element && target.closest(`[${NOTIFICATIONS_PANEL_ATTRIBUTE}]`))
          return;
        if (active) onAction('right');
      }}
    >
      <Navigation>
        <Item
          ref={notificationsButtonRef}
          type="button"
          $active={open}
          $selected={selected === 'notifications'}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          aria-expanded={expanded && selected === 'notifications'}
          onFocus={() => move('notifications')}
          onMouseEnter={() => move('notifications')}
          onClick={onEnterNotifications}
        >
          <Icon aria-hidden="true">
            <NotificationsIcon />
          </Icon>
          {unreadCount > 0 && (
            <UnreadBadge aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</UnreadBadge>
          )}
          {open && <span>Notifications</span>}
        </Item>
        <Item
          ref={searchRef}
          type="button"
          $active={open}
          $selected={selected === 'search'}
          aria-label="Search"
          onFocus={() => move('search')}
          onMouseEnter={() => move('search')}
          onClick={onSearch}
        >
          <Icon aria-hidden="true">
            <SearchIcon />
          </Icon>
          {open && <span>Search</span>}
        </Item>
        {showSettings && (
          <>
            <EmptySpace />
            <Item
              ref={settingsRef}
              type="button"
              $active={open}
              $selected={selected === 'settings'}
              aria-label="Settings"
              onFocus={() => move('settings')}
              onMouseEnter={() => move('settings')}
              onClick={onSettings}
            >
              <Icon aria-hidden="true">
                <SettingsIcon />
              </Icon>
              {open && <span>Settings</span>}
            </Item>
          </>
        )}
      </Navigation>
    </Rail>
  );
};
