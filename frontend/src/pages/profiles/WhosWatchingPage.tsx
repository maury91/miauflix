import { liveAvatarsSupported } from '@features/profiles/avatar/runtime';
import { AddProfileCard, ProfileCard } from '@features/profiles/ui/ProfileCard';
import {
  Heading,
  IconButton,
  NavItem,
  NavRail,
  SurfaceContextProvider,
} from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { useTouchScreen } from '@shared/hooks/useTouchScreen';
import { FocusGroup, FocusScope, NavigationProvider, useActiveIdWithin } from '@shared/navigation';
import { LogoBackdrop } from '@shared/ui/logo/LogoBackdrop';
import { useAppSelector } from '@store/hooks';
import {
  selectAdminSession,
  selectCurrentUser,
  selectProfiles,
  type SessionInfo,
} from '@store/slices/auth';
import { motion } from 'framer-motion';
import { type FC, useEffect, useState } from 'react';

import * as styles from './whosWatchingPage.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import EditIcon from '~icons/mdi/pencil-outline';

const NAV = {
  scope: 'whos-watching',
  rail: 'whos-watching-rail',
  back: 'whos-watching-back',
  content: 'whos-watching-content',
  profiles: 'whos-watching-profiles',
  add: 'whos-watching-add',
} as const;

const PROFILE_PREFIX = 'profile:';
const EDIT_PREFIX = 'profile-edit:';
const profileNavId = (userId: string) => `${PROFILE_PREFIX}${userId}`;
const editNavId = (userId: string) => `${EDIT_PREFIX}${userId}`;

/** The profile a navigation id belongs to (its tile or its edit button). */
const profileOf = (navId: string | null): string | null =>
  navId?.startsWith(PROFILE_PREFIX)
    ? navId.slice(PROFILE_PREFIX.length)
    : navId?.startsWith(EDIT_PREFIX)
      ? navId.slice(EDIT_PREFIX.length)
      : null;

export interface WhosWatchingPageProps {
  /** The profile to focus first (e.g. one just created or edited); otherwise the one watching. */
  focusUserId?: string | null;
  onSelect: (profile: SessionInfo) => void;
  /** The edit button under the focused profile: open the profile editor for it. */
  onEdit: (profile: SessionInfo) => void;
  onAdd: () => void;
  /** Back without switching; absent at startup, when there is nothing to go back to. */
  onBack?: () => void;
}

/**
 * Who's watching: the profiles signed in on this device, as ProfileTiles. One navigation scope:
 * the back rail (when there is somewhere to go back to), then the profiles, a spatial group that
 * wraps. The profile holding focus shows an edit button under it, reached with Down.
 */
const WhosWatchingPage: FC<WhosWatchingPageProps> = props => {
  const { onBack } = props;
  // Back leaves the page. An element scope, so it wins over the page-wide navigation keys.
  const pageRef = useKeyboardNavigation({
    onBack: () => {
      onBack?.();
      return true;
    },
  });
  return (
    <motion.main
      ref={pageRef}
      className={styles.page}
      aria-labelledby="whos-watching-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <NavigationProvider>
        <WhosWatchingScreen {...props} />
      </NavigationProvider>
    </motion.main>
  );
};

function WhosWatchingScreen({
  focusUserId,
  onSelect,
  onEdit,
  onAdd,
  onBack,
}: WhosWatchingPageProps) {
  const profiles = useAppSelector(selectProfiles);
  const adminSession = useAppSelector(selectAdminSession);
  const currentUser = useAppSelector(selectCurrentUser);
  const active = useActiveIdWithin(NAV.profiles);
  const live = liveAvatarsSupported({ onTv: true });
  const initialUserId = focusUserId ?? currentUser?.id ?? profiles[0]?.user.id;
  const initialId = initialUserId ? profileNavId(initialUserId) : adminSession ? NAV.add : NAV.back;

  // The profile whose edit button shows: the one holding focus, kept while focus is on the rail,
  // none on Add profile. On a touch screen nothing holds focus, so every profile shows its own
  const touch = useTouchScreen();
  const [editUserId, setEditUserId] = useState<string | null>(initialUserId ?? null);
  useEffect(() => {
    if (active === null) return;
    setEditUserId(profileOf(active));
  }, [active]);

  return (
    <FocusScope id={NAV.scope} layout="horizontal" initialId={initialId}>
      <LogoBackdrop />
      {onBack && (
        <div className={styles.rail}>
          <NavRail label="Profiles" navId={NAV.rail}>
            <NavItem navId={NAV.back} icon={<ArrowLeftIcon />} label="Back" onClick={onBack} />
          </NavRail>
        </div>
      )}
      <SurfaceContextProvider value="solid">
        <FocusGroup id={NAV.content} layout="vertical">
          <div className={styles.body}>
            <div className={styles.title}>
              <Heading level={1} variant="display" align="center" id="whos-watching-title">
                Who’s watching?
              </Heading>
            </div>
            <FocusGroup id={NAV.profiles} layout="spatial">
              <ul className={styles.profiles}>
                {profiles.map(profile => {
                  const userId = profile.user.id;
                  const navId = profileNavId(userId);
                  const name = profile.user.displayName || profile.user.email;
                  return (
                    <li key={userId} className={styles.profile}>
                      <ProfileCard
                        navId={navId}
                        user={profile.user}
                        session={profile.session}
                        live={live}
                        focused={active === navId}
                        onActivate={() => onSelect(profile)}
                      />
                      {/* Room kept under every profile, so the button never moves the row */}
                      <div className={styles.editSlot}>
                        {(touch || editUserId === userId) && (
                          <IconButton
                            navId={editNavId(userId)}
                            label={`Edit ${name}`}
                            icon={<EditIcon />}
                            onClick={() => onEdit(profile)}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
                {adminSession && (
                  <li className={styles.profile}>
                    <AddProfileCard navId={NAV.add} onActivate={onAdd} />
                  </li>
                )}
              </ul>
            </FocusGroup>
          </div>
        </FocusGroup>
      </SurfaceContextProvider>
    </FocusScope>
  );
}

export default WhosWatchingPage;
