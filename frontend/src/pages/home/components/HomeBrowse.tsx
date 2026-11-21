import { type AppRoute, navigate } from '@app/router';
import { useLogoutMutation } from '@features/auth/api/auth.api';
import { logOutSessions } from '@features/auth/logOutSessions';
import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { NotificationsMenu } from '@features/notifications/ui/NotificationsMenu';
import { ProfileMenu } from '@features/profiles/ui/ProfileMenu';
import { changeTvServer } from '@features/server-discovery/lib/connect';
import { displayServerAddress } from '@features/server-discovery/lib/server-address';
import { API_URL, builtForTizen } from '@shared/config/constants';
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
import { type SettingsArea, SettingsMenu } from './SettingsMenu';

type Panel = 'notifications' | 'profile' | 'settings';

/** How long a key-driven slide between rows keeps the pointer from focusing what slides under it. */
const ROW_SLIDE_POINTER_LOCK_MS = 400;

interface HomeBrowseProps {
  /** Keys and focus are Home's: false behind the intro or under the Trakt prompt. */
  interactive: boolean;
  /** The row focus starts on (the remembered one), by list slug. */
  initialRowSlug: string | undefined;
  /** Home's first row, by list slug (Continue watching joins above the lists once its cards load). */
  firstRowSlug: string | undefined;
  /** Focus moved to another row: by `input` (only key moves bring the row into view). */
  onRowFocus: (slug: string, input: InputKind) => void;
  onSearch: () => void;
  onOpenNotification: (notification: NotificationItem) => void;
  /** The hero and the rows (the `home-rows` group). */
  children: ReactNode;
}

/**
 * Home's browse screen on the navigation layer (docs/plans/style-guide.md, sections 9 and 10): a
 * horizontal scope holding the rail and the rows. Left from a row's first card reaches the rail,
 * Right from the rail returns to the row it came from; Back moves between the two. The panels beside
 * the rail (notifications, the profile, settings) are contained scopes while they have the keys:
 * their rail item's Right (or a press) hands them the keys, Left or Back hand them back.
 * Render under a NavigationProvider.
 */
export function HomeBrowse({
  interactive,
  initialRowSlug,
  firstRowSlug,
  onRowFocus,
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
  const returnRailItem = useSelector((state: RootState) => state.homeNavigation.railItem);
  const profile = useMemo(
    () => (sessionId && currentUser ? { session: sessionId, user: currentUser } : null),
    [currentUser, sessionId]
  );

  // Read once: where focus starts
  const settingsAreas = useMemo<SettingsArea[]>(
    () => [
      ...(isAdmin ? (['configuration', 'storage', 'sources'] as const) : []),
      ...(builtForTizen ? (['server'] as const) : []),
    ],
    [isAdmin]
  );
  const [initialRail] = useState(() =>
    startOnRail && returnRailItem === 'settings' && settingsAreas.length
      ? HOME_NAV.railItem('settings')
      : startOnRail && profile
        ? HOME_NAV.railItem('profile')
        : undefined
  );
  // The row as Home becomes interactive, not as it mounted: rows can arrive behind the intro
  // (Continue watching above the lists)
  const latestInitialRow = useRef(initialRowSlug);
  latestInitialRow.current = initialRowSlug;

  const railItem = railItemOf(useActiveIdWithin(HOME_NAV.rail));
  const activeInRows = useActiveIdWithin(HOME_NAV.rows);
  const activeRow = rowSlugOf(activeInRows);
  const [panelInUse, setPanelInUse] = useState<Panel | null>(null);
  const open = (panel: Panel) =>
    interactive && (panelInUse === panel || (panelInUse === null && railItem === panel));
  const notificationsOpen = open('notifications');
  const profileOpen = open('profile') && profile !== null;
  const settingsOpen = open('settings') && settingsAreas.length > 0;
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
    const initialId =
      initialRail ?? (latestInitialRow.current && HOME_NAV.row(latestInitialRow.current));
    if (getActiveId() === null && !(initialId && focus(initialId))) focus(HOME_NAV.scope);
    // Only becoming interactive takes focus; later rows are the layer's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Continue watching appears once its cards load, after the lists: focus already rests on the
  // first list. Until a key or the pointer moves anything, focus belongs on the first row, so it
  // goes to the row that took that place instead of following its list down. A card the pointer
  // focused (hovering it is enough) is the user's choice, as is any real pointer movement.
  const moved = useRef(false);
  useEffect(() => {
    if (!interactive) return;
    const onInput = () => {
      moved.current = true;
    };
    // Content sliding under a resting pointer fires moves without any movement
    const onPointerMove = (event: PointerEvent) => {
      if (event.movementX || event.movementY) moved.current = true;
    };
    window.addEventListener('keydown', onInput, true);
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('pointermove', onPointerMove, true);
    return () => {
      window.removeEventListener('keydown', onInput, true);
      window.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('pointermove', onPointerMove, true);
    };
  }, [interactive]);
  useEffect(() => {
    if (interactive && activeInRows !== null && lastInput() === 'pointer') moved.current = true;
  }, [activeInRows, interactive, lastInput]);
  const firstRow = useRef(firstRowSlug);
  useEffect(() => {
    const previous = firstRow.current;
    firstRow.current = firstRowSlug;
    if (!interactive || moved.current || !firstRowSlug || !previous) return;
    if (previous !== firstRowSlug && activeRow === previous) focus(HOME_NAV.row(firstRowSlug));
  }, [activeRow, firstRowSlug, focus, interactive]);

  const enterPanel = (panel: Panel) => {
    if (panel === 'notifications' && !hasNotifications) return;
    setPanelInUse(panel);
  };
  const leavePanel = (panel: Panel) => {
    setPanelInUse(null);
    focus(HOME_NAV.railItem(panel));
  };
  /** Leave for a screen open from a panel; coming back, its rail item has the keyboard. */
  const openPanelScreen = (panel: 'profile' | 'settings', route: AppRoute) => {
    dispatch(homeNavigationActions.returnToRail(panel));
    navigate(route, { parent: { type: 'home' } });
  };
  const openSettingsArea = (area: SettingsArea) => {
    if (area === 'server') changeTvServer();
    else openPanelScreen('settings', { type: area });
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
      if (railItem === 'settings' && settingsAreas.length) {
        enterPanel('settings');
        return true;
      }
      return false;
    },
  });

  // Stable for the memoized rail
  const onEnterNotifications = useStableCallback(() => enterPanel('notifications'));
  const onEnterProfile = useStableCallback(() => enterPanel('profile'));
  const onEnterSettings = useStableCallback(() => enterPanel('settings'));
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
      onSwitch={() => openPanelScreen('profile', { type: 'profiles' })}
      onEdit={() => openPanelScreen('profile', { type: 'editProfile', userId: profile.user.id })}
      onPreferences={() => openPanelScreen('profile', { type: 'preferences' })}
      onLogout={() => {
        // Who's watching (or sign-in, with no other profile) takes over once it is gone:
        // every session of this profile on the device ends, or it would still be listed.
        dispatch(homeNavigationActions.returnToRail('profile'));
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
  ) : settingsOpen ? (
    <SettingsMenu
      areas={settingsAreas}
      serverAddress={displayServerAddress(API_URL)}
      focused={panelInUse === 'settings'}
      onOpen={openSettingsArea}
      onExit={() => leavePanel('settings')}
      onPointerEnter={() => setPanelInUse('settings')}
    />
  ) : null;

  return (
    <FocusScope
      id={HOME_NAV.scope}
      layout="horizontal"
      initialId={initialRail ?? (initialRowSlug ? HOME_NAV.row(initialRowSlug) : undefined)}
    >
      <div ref={keysRef} className={styles.page} inert={!interactive}>
        {flyout && <div className={styles.panelScrim} aria-hidden="true" />}
        <HomeSidebar
          showSettings={settingsAreas.length > 0}
          onEnterSettings={onEnterSettings}
          onSearch={onSearch}
          profile={profile}
          onEnterProfile={onEnterProfile}
          onEnterNotifications={onEnterNotifications}
          openPanel={
            notificationsOpen
              ? 'notifications'
              : profileOpen
                ? 'profile'
                : settingsOpen
                  ? 'settings'
                  : null
          }
          onPointerLeave={onRailPointerLeave}
          unreadCount={notifications.unreadCount}
          flyout={flyout}
        />
        {children}
      </div>
    </FocusScope>
  );
}
