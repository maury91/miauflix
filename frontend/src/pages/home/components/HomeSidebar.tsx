import { ProfileAvatar } from '@features/profiles/avatar/ProfileAvatar';
import { PROFILE_RAIL_ITEM_ATTRIBUTE } from '@features/profiles/ui/ProfileMenu';
import { NavItem, NavRail } from '@shared/design-system';
import { useActiveIdWithin } from '@shared/navigation';
import type { SessionInfo } from '@store/slices/auth';
import { memo, type ReactNode, useState } from 'react';

import { HOME_NAV } from '../homeNav';
import * as styles from './homeSidebar.css';
import { SETTINGS_RAIL_ITEM_ATTRIBUTE } from './SettingsMenu';

import NotificationsIcon from '~icons/mdi/bell-outline';
import SettingsIcon from '~icons/mdi/cog-outline';
import SearchIcon from '~icons/mdi/magnify';

interface HomeSidebarProps {
  showSettings: boolean;
  /** Move the keyboard into the settings panel (the settings areas). */
  onEnterSettings: () => void;
  onSearch: () => void;
  /** The profile watching; its Plushie opens the profile panel. */
  profile?: SessionInfo | null;
  /** Move the keyboard into the profile panel (switch or edit the profile). */
  onEnterProfile?: () => void;
  /** Move the keyboard into the notifications panel. */
  onEnterNotifications: () => void;
  /** The panel open beside the rail, drawn as `flyout`; the rail stays expanded meanwhile. */
  openPanel?: 'notifications' | 'profile' | 'settings' | null;
  /** The pointer left the rail and the panel beside it: focus goes back to the rows. */
  onPointerLeave: () => void;
  unreadCount: number;
  /** The open panel, drawn beside the rail. */
  flyout?: ReactNode;
}

/**
 * Home's rail: Notifications and Search at the top, the watching profile and Settings at the
 * bottom. NavItems registered with the navigation layer; the rail expands while it holds focus,
 * while the pointer is over it, or while a panel beside it is open. Memoized: Home re-renders on
 * every row change, and the rail does not change with it.
 */
export const HomeSidebar = memo(function HomeSidebar({
  showSettings,
  onEnterSettings,
  onSearch,
  profile = null,
  onEnterProfile,
  onEnterNotifications,
  openPanel = null,
  onPointerLeave,
  unreadCount,
  flyout,
}: HomeSidebarProps) {
  const [hovered, setHovered] = useState(false);
  const holdsFocus = useActiveIdWithin(HOME_NAV.rail) !== null;
  const showProfile = Boolean(profile && onEnterProfile);
  const name = profile ? profile.user.displayName || profile.user.email : '';

  return (
    <div className={styles.position} data-home-rail="">
      <NavRail
        label="Home navigation"
        navId={HOME_NAV.rail}
        defaultNavId={HOME_NAV.railItem('search')}
        expanded={openPanel !== null || hovered || holdsFocus}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          onPointerLeave();
        }}
        flyout={flyout}
        end={
          <>
            {showProfile && profile && (
              <NavItem
                navId={HOME_NAV.railItem('profile')}
                icon={
                  <span className={styles.avatarSlot}>
                    <span className={styles.avatar}>
                      <ProfileAvatar user={profile.user} session={profile.session} live />
                    </span>
                  </span>
                }
                label={profile.user.displayName || 'Profile'}
                aria-label={`Profile, ${name} is watching`}
                aria-expanded={openPanel === 'profile'}
                {...{ [PROFILE_RAIL_ITEM_ATTRIBUTE]: '' }}
                onClick={onEnterProfile}
              />
            )}
            {showSettings && (
              <NavItem
                navId={HOME_NAV.railItem('settings')}
                icon={<SettingsIcon />}
                label="Settings"
                aria-expanded={openPanel === 'settings'}
                {...{ [SETTINGS_RAIL_ITEM_ATTRIBUTE]: '' }}
                onClick={onEnterSettings}
              />
            )}
          </>
        }
      >
        <NavItem
          navId={HOME_NAV.railItem('notifications')}
          icon={<NotificationsIcon />}
          label="Notifications"
          badge={unreadCount ? (unreadCount > 99 ? '99+' : String(unreadCount)) : undefined}
          badgeLabel={unreadCount ? `${unreadCount} unread` : undefined}
          aria-expanded={openPanel === 'notifications'}
          onClick={onEnterNotifications}
        />
        <NavItem
          navId={HOME_NAV.railItem('search')}
          icon={<SearchIcon />}
          label="Search"
          onClick={onSearch}
        />
      </NavRail>
    </div>
  );
});
