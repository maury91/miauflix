import { type AppRoute, navigate } from '@app/router';
import { useLogoutMutation } from '@features/auth/api/auth.api';
import { logOutSessions } from '@features/auth/logOutSessions';
import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { NotificationsMenu } from '@features/notifications/ui/NotificationsMenu';
import { ProfileMenu } from '@features/profiles/ui/ProfileMenu';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { useStableCallback } from '@shared/hooks/useStableCallback';
import { FocusScope, type InputKind, useActiveIdWithin, useNavigation } from '@shared/navigation';
import { useAppSelector } from '@store/hooks';
import {
  selectAvailableSessions,
  selectCurrentSessionId,
  selectCurrentUser,
  selectIsAdmin,
} from '@store/slices/auth';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import type { AppDispatch, RootState } from '@store/store';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { HOME_NAV, railItemOf, rowSlugOf } from '../homeNav';
import { useHomeNotifications } from '../hooks/useHomeNotifications';
import * as styles from './homeBrowse.css';
import { HomeSidebar } from './HomeSidebar';

type Panel = 'notifications' | 'profile';

/** How long a key-driven slide between rows keeps the pointer from focusing what slides under it. */
const ROW_SLIDE_POINTER_LOCK_MS = 400;

interface HomeBrowseProps {
  /** Keys and focus are Home's: false behind the intro or under the Trakt prompt. */
  interactive: boolean;
  /** The row focus starts on (the remembered one), by list slug. */
  initialRowSlug: string | undefined;
  /** Focus moved to another row: by `input` (only key moves bring the row into view). */
  onRowFocus: (slug: string, input: InputKind) => void;
  onSettings: () => void;
  onSearch: () => void;
  onOpenNotification: (notification: NotificationItem) => void;
  /** The hero and the rows (the `home-rows` group). */
  children: ReactNode;
}

/**
 * Home's browse screen on the navigation layer (docs/plans/style-guide.md, sections 9 and 10): a
 * horizontal scope holding the rail and the rows. Left from a row's first card reaches the rail,
 * Right from the rail returns to the row it came from; Back moves between the two. The panels beside
 * the rail (notifications, the profile) still move DOM focus themselves: the bell's and the
 * avatar's Right (or a press) hands them the keys, and they hand them back to their rail item.
 * Render under a NavigationProvider.
 */
export function HomeBrowse({
  interactive,
  initialRowSlug,
  onRowFocus,
  onSettings,
  onSearch,
  onOpenNotification,
  children,
}: HomeBrowseProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { focus, getActiveId, lastInput, lockPointer } = useNavigation();
  const sessionId = useSelector(selectCurrentSessionId);
  const currentUser = useSelector(selectCurrentUser);
  const availableSessions = useSelector(selectAvailableSessions);
  const isAdmin = useAppSelector(selectIsAdmin);
  // Coming back from a profile screen, the rail (not the rows) has the keyboard
  const startOnRail = useSelector(
    (state: RootState) => state.homeNavigation.activeRegion === 'sidebar'
  );
  const profile = useMemo(
    () => (sessionId && currentUser ? { session: sessionId, user: currentUser } : null),
    [currentUser, sessionId]
  );

  // Read once: where focus starts
  const [initialId] = useState(() =>
    startOnRail && profile
      ? HOME_NAV.railItem('profile')
      : initialRowSlug
        ? HOME_NAV.row(initialRowSlug)
        : undefined
  );

  const railItem = railItemOf(useActiveIdWithin(HOME_NAV.rail));
  const activeRow = rowSlugOf(useActiveIdWithin(HOME_NAV.rows));
  const [panelInUse, setPanelInUse] = useState<Panel | null>(null);
  const open = (panel: Panel) =>
    interactive && (panelInUse === panel || (panelInUse === null && railItem === panel));
  const notificationsOpen = open('notifications');
  const profileOpen = open('profile') && profile !== null;
  const notifications = useHomeNotifications(sessionId, notificationsOpen);
  const hasNotifications =
    notifications.unreadCount > 0 || notifications.hasRead || notifications.unread.items.length > 0;
  const [logout] = useLogoutMutation();

  // The row holding focus: Home follows it with the hero and brings it into view
  const latestRowFocus = useRef(onRowFocus);
  latestRowFocus.current = onRowFocus;
  useEffect(() => {
    if (activeRow === null) return;
    const input = lastInput();
    latestRowFocus.current(activeRow, input);
    if (input !== 'key') return;
    // The rows slide under a resting pointer: it focuses nothing until they stop
    const release = lockPointer();
    const timer = window.setTimeout(release, ROW_SLIDE_POINTER_LOCK_MS);
    return () => {
      window.clearTimeout(timer);
      release();
    };
  }, [activeRow, lastInput, lockPointer]);

  // Focus starts on the remembered row (or the rail), once Home is interactive: behind the intro
  // nothing can take it.
  useEffect(() => {
    if (!interactive) return;
    dispatch(homeNavigationActions.setActiveRegion('carousel'));
    if (getActiveId() === null && !(initialId && focus(initialId))) focus(HOME_NAV.scope);
    // Only becoming interactive takes focus; later rows are the layer's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  const enterPanel = (panel: Panel) => {
    if (panel === 'notifications' && !hasNotifications) return;
    setPanelInUse(panel);
  };
  const leavePanel = (panel: Panel) => {
    setPanelInUse(null);
    focus(HOME_NAV.railItem(panel === 'notifications' ? 'notifications' : 'profile'));
  };
  /** Leave a profile screen open from the panel; coming back, the rail has the keyboard. */
  const openProfileScreen = (route: AppRoute) => {
    dispatch(homeNavigationActions.setActiveRegion('sidebar'));
    navigate(route, { parent: { type: 'home' } });
  };

  // Keys the layer doesn't own here: Back between the rows and the rail, Right into a panel
  const keysRef = useKeyboardNavigation({
    enabled: interactive && panelInUse === null,
    onBack: () => {
      if (railItem !== null) focus(HOME_NAV.rows);
      else focus(HOME_NAV.rail);
      return true;
    },
    onRight: () => {
      if (railItem === 'notifications') {
        // With no notifications the panel has nothing to move to: Right stays on the bell
        enterPanel('notifications');
        return true;
      }
      if (railItem === 'profile' && profile) {
        enterPanel('profile');
        return true;
      }
      return false;
    },
  });

  // Stable for the memoized rail
  const onEnterNotifications = useStableCallback(() => enterPanel('notifications'));
  const onEnterProfile = useStableCallback(() => enterPanel('profile'));
  const onRailPointerLeave = useStableCallback(() => {
    // The pointer left the rail and its panel for the page: focus goes back to the rows
    const inRail = panelInUse !== null || railItemOf(getActiveId()) !== null;
    setPanelInUse(null);
    if (inRail) focus(HOME_NAV.rows);
  });

  const flyout = notificationsOpen ? (
    <NotificationsMenu
      unread={notifications.unread}
      read={notifications.read}
      unreadCount={notifications.unreadCount}
      hasRead={notifications.hasRead}
      showRead={notifications.showRead}
      focused={panelInUse === 'notifications'}
      onToggleShowRead={notifications.toggleShowRead}
      onMarkAllRead={notifications.markAllRead}
      onOpen={notification => {
        if (!notification.readAt) notifications.markRead(notification.id);
        onOpenNotification(notification);
      }}
      onExit={() => leavePanel('notifications')}
      onPointerEnter={() => setPanelInUse('notifications')}
    />
  ) : profileOpen && profile ? (
    <ProfileMenu
      profile={profile}
      focused={panelInUse === 'profile'}
      onSwitch={() => openProfileScreen({ type: 'profiles' })}
      onEdit={() => openProfileScreen({ type: 'editProfile', userId: profile.user.id })}
      onLogout={() => {
        // Who's watching (or sign-in, with no other profile) takes over once it is gone:
        // every session of this profile on the device ends, or it would still be listed.
        dispatch(homeNavigationActions.setActiveRegion('sidebar'));
        void logOutSessions(
          availableSessions
            .filter(({ user }) => user.id === profile.user.id)
            .map(({ session }) => session),
          session => logout({ session })
        );
      }}
      onExit={() => leavePanel('profile')}
      onPointerEnter={() => setPanelInUse('profile')}
    />
  ) : null;

  return (
    <FocusScope id={HOME_NAV.scope} layout="horizontal" initialId={initialId}>
      <div ref={keysRef} className={styles.page} inert={!interactive}>
        {flyout && <div className={styles.panelScrim} aria-hidden="true" />}
        <HomeSidebar
          showSettings={isAdmin}
          onSettings={onSettings}
          onSearch={onSearch}
          profile={profile}
          onEnterProfile={onEnterProfile}
          onEnterNotifications={onEnterNotifications}
          openPanel={notificationsOpen ? 'notifications' : profileOpen ? 'profile' : null}
          onPointerLeave={onRailPointerLeave}
          unreadCount={notifications.unreadCount}
          flyout={flyout}
        />
        {children}
      </div>
    </FocusScope>
  );
}
