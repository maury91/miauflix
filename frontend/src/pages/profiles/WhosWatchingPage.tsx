import { liveAvatarsSupported } from '@features/profiles/avatar/runtime';
import { AddProfileCard, ProfileCard } from '@features/profiles/ui/ProfileCard';
import {
  type Direction,
  focusFirst,
  moveFocus,
  NAV_ATTRIBUTE,
  NAV_REGION_ATTRIBUTE,
} from '@features/profiles/ui/spatialFocus';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button } from '@shared/ui';
import { BackRail } from '@shared/ui/rail/BackRail';
import { RAIL_COLLAPSED_WIDTH_CSS } from '@shared/ui/rail/rail.styles';
import { useAppSelector } from '@store/hooks';
import {
  selectAdminSession,
  selectCurrentUser,
  selectProfiles,
  type SessionInfo,
} from '@store/slices/auth';
import { motion } from 'framer-motion';
import { type FC, useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Page = styled(motion.main)<{ $rail: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(2rem, 6vh, 5rem);
  padding: 12vh 5vw 6vh;
  /* Clear of the back rail, keeping the profiles centred in the room beside it. */
  padding-left: ${({ $rail }) => ($rail ? `calc(${RAIL_COLLAPSED_WIDTH_CSS} + 5vw)` : '5vw')};
  background: radial-gradient(ellipse at 50% 40%, #16191b 0%, #0a0d0f 70%);
  color: #f5f5f5;
  font-family: 'Poppins', sans-serif;
  overflow: auto;
`;

const Title = styled.h1`
  margin: 0;
  font-size: clamp(2rem, 4.6vw, 5.5rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  text-align: center;
  text-transform: none;
`;

const Profiles = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: clamp(1.5rem, 3.4vw, 4.5rem);
  max-width: 100%;
`;

const RailArea = styled.div`
  display: contents;
`;

const Actions = styled.div`
  display: flex;
  justify-content: center;
`;

export interface WhosWatchingPageProps {
  /** Manage mode opens the editor for the chosen profile instead of switching to it. */
  mode?: 'select' | 'manage';
  /** The profile to focus first (e.g. one just created); otherwise the one watching. */
  focusUserId?: string | null;
  onSelect: (profile: SessionInfo) => void;
  onEdit: (profile: SessionInfo) => void;
  onAdd: () => void;
  onManage: () => void;
  /** Leave manage mode for the selector (the back rail, or Back). */
  onDone: () => void;
  /** Back without switching; absent at startup, when there is nothing to go back to. */
  onBack?: () => void;
}

/** Who's watching: the profiles signed in on this device. */
const WhosWatchingPage: FC<WhosWatchingPageProps> = ({
  mode = 'select',
  focusUserId,
  onSelect,
  onEdit,
  onAdd,
  onManage,
  onDone,
  onBack,
}) => {
  const profiles = useAppSelector(selectProfiles);
  const adminSession = useAppSelector(selectAdminSession);
  const currentUser = useAppSelector(selectCurrentUser);
  const pageRef = useRef<HTMLElement | null>(null);
  const managing = mode === 'manage';
  /** Manage always returns to the selector; the selector only when opened from Home. */
  const back = managing ? onDone : onBack;
  const live = liveAvatarsSupported();
  const initialFocus = focusUserId ?? currentUser?.id ?? profiles[0]?.user.id;
  /** The card under the highlight, from the remote's moves as well as focus events. */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const syncFocused = useCallback(() => {
    const active = document.activeElement;
    setFocusedId(
      active instanceof HTMLElement && pageRef.current?.contains(active)
        ? (active.dataset['profileId'] ?? null)
        : null
    );
  }, []);
  const move = (direction: Direction) => {
    moveFocus(pageRef.current, direction);
    syncFocused();
    return true;
  };

  const focusInitial = useCallback(() => {
    const focused = focusFirst(
      pageRef.current,
      initialFocus ? `[data-profile-id="${CSS.escape(initialFocus)}"]` : undefined
    );
    syncFocused();
    return focused;
  }, [initialFocus, syncFocused]);

  useEffect(() => {
    focusInitial();
    // Only when the page opens or switches mode; later moves are the user's.
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const keyboardRef = useKeyboardNavigation({
    exclusive: true,
    onRestoreFocus: focusInitial,
    onLeft: () => move('left'),
    onRight: () => move('right'),
    onUp: () => move('up'),
    onDown: () => move('down'),
    onConfirm: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && pageRef.current?.contains(active)) active.click();
      return true;
    },
    onBack: () => {
      back?.();
      return true;
    },
  });

  const setPageRef = useCallback(
    (element: HTMLElement | null) => {
      pageRef.current = element;
      keyboardRef(element);
    },
    [keyboardRef]
  );

  return (
    <Page
      ref={setPageRef}
      $rail={Boolean(back)}
      aria-labelledby="whos-watching-title"
      onFocus={syncFocused}
      onBlur={() => setFocusedId(null)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Title id="whos-watching-title">{managing ? 'Manage profiles' : 'Who’s watching?'}</Title>
      <Profiles role="list">
        {profiles.map(profile => (
          <div role="listitem" key={profile.user.id}>
            <ProfileCard
              user={profile.user}
              session={profile.session}
              live={live}
              editing={managing}
              focused={focusedId === profile.user.id}
              onActivate={() => (managing ? onEdit(profile) : onSelect(profile))}
            />
          </div>
        ))}
        {adminSession && !managing && (
          <div role="listitem">
            <AddProfileCard focused={focusedId === 'add'} onActivate={onAdd} />
          </div>
        )}
      </Profiles>
      {!managing && (
        <Actions>
          <Button
            data-profile-nav=""
            appearance="settings"
            color="secondary"
            size="large"
            onClick={onManage}
          >
            Manage profiles
          </Button>
        </Actions>
      )}
      {back && (
        // An area of its own, so Left from the first profile crosses onto it at any height.
        <RailArea {...{ [NAV_REGION_ATTRIBUTE]: '' }}>
          <BackRail
            label={managing ? 'Back to Who’s watching' : 'Back'}
            onBack={() => back()}
            buttonAttributes={{ [NAV_ATTRIBUTE]: '' }}
          />
        </RailArea>
      )}
    </Page>
  );
};

export default WhosWatchingPage;
