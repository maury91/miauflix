import { ProfileAvatar } from '@features/profiles/avatar/ProfileAvatar';
import { Divider, Heading, List, ListItem, Text, useFlyoutBottom } from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { useT } from '@shared/i18n';
import { FocusScope } from '@shared/navigation';
import type { SessionInfo } from '@store/slices/auth';
import type { FC, ReactNode } from 'react';

import * as styles from './profileMenu.css';

import SwitchIcon from '~icons/mdi/account-switch-outline';
import LogoutIcon from '~icons/mdi/logout';
import EditIcon from '~icons/mdi/pencil-outline';
import PreferencesIcon from '~icons/mdi/tune-variant';

/** Marks the panel, so the rail can tell the pointer moved onto it rather than away. */
export const PROFILE_PANEL_ATTRIBUTE = 'data-profile-panel';

/** The rail item the panel lines up with. */
export const PROFILE_RAIL_ITEM_ATTRIBUTE = 'data-rail-profile';

/** Navigation ids of the panel's scope and options. */
const PROFILE_MENU_NAV = {
  scope: 'profile-menu',
  switch: 'profile-menu:switch',
  edit: 'profile-menu:edit',
  preferences: 'profile-menu:preferences',
  logout: 'profile-menu:logout',
} as const;

export interface ProfileMenuProps {
  profile: SessionInfo;
  /**
   * The keyboard is in the panel (rather than on the rail): its options become a contained
   * navigation scope, entered at Switch profile.
   */
  focused: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  /** Open the profile's language preferences. */
  onPreferences: () => void;
  /** Sign this profile out of the device. */
  onLogout: () => void;
  /** Left or Back: hand the keyboard back to the rail, keeping the panel open. */
  onExit: () => void;
  /** The pointer moved onto the panel. Leaving it is the rail's: the panel sits in its flyout. */
  onPointerEnter: () => void;
}

/**
 * The profile panel beside the rail: who is watching, then Switch profile, Edit profile,
 * Preferences and Logout as ListItems. While it has the keyboard it is a contained scope of the navigation layer
 * (Up/Down move, OK runs, the ends stay put); Left or Back hand the keyboard back to the rail.
 */
export const ProfileMenu: FC<ProfileMenuProps> = ({
  profile,
  focused,
  onSwitch,
  onEdit,
  onPreferences,
  onLogout,
  onExit,
  onPointerEnter,
}) => {
  const t = useT();
  const bottom = useFlyoutBottom(`[${PROFILE_RAIL_ITEM_ATTRIBUTE}]`);
  // Hidden until measured, the panel can only take the keyboard once it is placed
  const placed = bottom !== null;
  const inUse = focused && placed;
  const keysRef = useKeyboardNavigation({
    enabled: inUse,
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
  // Only an open panel registers its options, so the rail never moves into it
  const nav = (id: string) => (inUse ? id : undefined);
  const options: ReactNode = (
    <>
      <List label={t('profileMenu.label')}>
        <ListItem
          navId={nav(PROFILE_MENU_NAV.switch)}
          leading={<SwitchIcon />}
          title={t('profileMenu.switch')}
          onClick={onSwitch}
        />
        <ListItem
          navId={nav(PROFILE_MENU_NAV.edit)}
          leading={<EditIcon />}
          title={t('profileMenu.edit')}
          onClick={onEdit}
        />
        <ListItem
          navId={nav(PROFILE_MENU_NAV.preferences)}
          leading={<PreferencesIcon />}
          title={t('profileMenu.preferences')}
          onClick={onPreferences}
        />
      </List>
      <Divider />
      <List label={t('profileMenu.session')}>
        <ListItem
          navId={nav(PROFILE_MENU_NAV.logout)}
          leading={<LogoutIcon />}
          title={t('profileMenu.logout')}
          onClick={onLogout}
        />
      </List>
    </>
  );

  const name = profile.user.displayName || profile.user.email;
  return (
    <div
      ref={keysRef}
      className={styles.zone}
      {...{ [PROFILE_PANEL_ATTRIBUTE]: '' }}
      // Bottom-aligned with the avatar on the rail; hidden for the moment before it is measured
      style={{ bottom: bottom ?? undefined, visibility: placed ? undefined : 'hidden' }}
      onMouseEnter={onPointerEnter}
    >
      <section className={styles.panel} aria-label={t('profileMenu.label')}>
        <header className={styles.header}>
          <span className={styles.avatar} aria-hidden="true">
            <ProfileAvatar user={profile.user} session={profile.session} />
          </span>
          <div className={styles.headerText}>
            <Heading level={2} variant="heading" maxLines={1}>
              {name}
            </Heading>
            <Text variant="caption" tone="secondary">
              {t('profileMenu.watchingNow')}
            </Text>
          </div>
        </header>
        {inUse ? (
          <FocusScope id={PROFILE_MENU_NAV.scope} contain initialId={PROFILE_MENU_NAV.switch}>
            {options}
          </FocusScope>
        ) : (
          options
        )}
      </section>
    </div>
  );
};
