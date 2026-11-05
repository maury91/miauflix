import { ProfileAvatar } from '@features/profiles/avatar/ProfileAvatar';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import {
  Rail,
  RailIcon as Icon,
  RailItem as Item,
  RailNavigation as Navigation,
} from '@shared/ui/rail/rail.styles';
import type { SessionInfo } from '@store/slices/auth';
import { memo, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import type { HomeAction, NavigationOutcome } from '../homeNavigation';
import { NOTIFICATIONS_PANEL_ATTRIBUTE } from './NotificationsMenu';
import { PROFILE_PANEL_ATTRIBUTE, PROFILE_RAIL_ITEM_ATTRIBUTE } from './ProfileMenu';

import NotificationsIcon from '~icons/mdi/bell-outline';
import SettingsIcon from '~icons/mdi/cog-outline';
import SearchIcon from '~icons/mdi/magnify';

export type SidebarItem = 'notifications' | 'search' | 'profile' | 'settings';

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

/**
 * The watching profile's Plushie in place of an icon: centred on the icon's slot (so the label
 * lines up with the others) and drawn larger than it, since the picture has room around the
 * Plushie for hats.
 */
const AvatarIcon = styled(Icon)`
  position: relative;
`;

const Avatar = styled.span`
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2.1em;
  height: 2.1em;
  transform: translate(-50%, -50%);
  pointer-events: none;
`;

interface HomeSidebarProps {
  active: boolean;
  showSettings: boolean;
  onAction: (action: HomeAction) => NavigationOutcome;
  onHover: () => void;
  onSettings: () => void;
  onSearch: () => void;
  /** The profile watching; its Plushie opens the profile panel. */
  profile?: SessionInfo | null;
  /** Move the keyboard into the profile panel (switch or edit the profile). */
  onEnterProfile?: () => void;
  /** Move the keyboard into the notifications panel. */
  onEnterNotifications: () => void;
  /**
   * The item under the rail's highlight; the notifications panel shows while it is the bell,
   * the profile panel while it is the avatar.
   */
  onSelectedChange?: (item: SidebarItem) => void;
  /** Keep the rail expanded (e.g. while a panel beside it is in use). */
  expanded?: boolean;
  unreadCount: number;
  /** Whether there is anything, unread or read, to show in the notifications panel. */
  hasNotifications: boolean;
}

/**
 * Render the primary Home actions and restore the selected button when the rail activates.
 * Memoized: Home re-renders on every move, and the rail does not change with it.
 */
export const HomeSidebar = memo(function HomeSidebar({
  active,
  showSettings,
  onAction,
  onHover,
  onSettings,
  onSearch,
  profile = null,
  onEnterProfile,
  onEnterNotifications,
  onSelectedChange,
  expanded = false,
  unreadCount,
  hasNotifications,
}: HomeSidebarProps) {
  const open = active || expanded;
  const [selected, setSelected] = useState<SidebarItem>('search');
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const showProfile = Boolean(profile && onEnterProfile);

  const order: SidebarItem[] = [
    'notifications',
    'search',
    ...(showProfile ? (['profile'] as const) : []),
    ...(showSettings ? (['settings'] as const) : []),
  ];
  const focusSelected = (item: SidebarItem) => {
    if (item === 'notifications') notificationsButtonRef.current?.focus({ preventScroll: true });
    if (item === 'search') searchRef.current?.focus({ preventScroll: true });
    if (item === 'profile') profileRef.current?.focus({ preventScroll: true });
    if (item === 'settings') settingsRef.current?.focus({ preventScroll: true });
  };
  const focus = (item: SidebarItem) => {
    setSelected(item);
    onHover();
    focusSelected(item);
  };

  // Settings can disappear (e.g. admin rights change); never keep a hidden item selected.
  useEffect(() => {
    if ((!showSettings && selected === 'settings') || (!showProfile && selected === 'profile'))
      setSelected('search');
  }, [showProfile, showSettings, selected]);

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
    onRestoreFocus: () => {
      focusSelected(selected);
      return true;
    },
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
      // With no notifications the panel has nothing to move to, so Right stays on the bell.
      if (selected === 'notifications') {
        if (hasNotifications) onEnterNotifications();
      } else if (selected === 'profile' && showProfile) onEnterProfile?.();
      else onAction('right');
      return true;
    },
    onConfirm: () => {
      if (selected === 'settings' && showSettings) onSettings();
      else if (selected === 'profile' && showProfile) onEnterProfile?.();
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
        // Moving onto a panel beside the rail keeps it (and the rail) open.
        const target = event.relatedTarget;
        if (
          target instanceof Element &&
          target.closest(`[${NOTIFICATIONS_PANEL_ATTRIBUTE}], [${PROFILE_PANEL_ATTRIBUTE}]`)
        )
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
        <EmptySpace />
        {showProfile && profile && (
          <Item
            ref={profileRef}
            type="button"
            $active={open}
            $selected={selected === 'profile'}
            aria-label={`Profile, ${profile.user.displayName || profile.user.email} is watching`}
            aria-expanded={expanded && selected === 'profile'}
            {...{ [PROFILE_RAIL_ITEM_ATTRIBUTE]: '' }}
            onFocus={() => move('profile')}
            onMouseEnter={() => move('profile')}
            onClick={onEnterProfile}
          >
            <AvatarIcon aria-hidden="true">
              <Avatar>
                <ProfileAvatar user={profile.user} session={profile.session} />
              </Avatar>
            </AvatarIcon>
            {open && <span>{profile.user.displayName || 'Profiles'}</span>}
          </Item>
        )}
        {showSettings && (
          <>
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
});
