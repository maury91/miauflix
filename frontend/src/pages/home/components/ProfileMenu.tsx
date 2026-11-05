import { ProfileAvatar } from '@features/profiles/avatar/ProfileAvatar';
import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { RAIL_COLLAPSED_WIDTH_CSS, RAIL_EXPANDED_WIDTH_CSS } from '@shared/ui/rail/rail.styles';
import type { SessionInfo } from '@store/slices/auth';
import { type FC, type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import SwitchIcon from '~icons/mdi/account-switch-outline';
import ChevronIcon from '~icons/mdi/chevron-right';
import LogoutIcon from '~icons/mdi/logout';
import EditIcon from '~icons/mdi/pencil-outline';

/** Marks the panel, so the rail can tell the pointer moved onto it rather than away. */
export const PROFILE_PANEL_ATTRIBUTE = 'data-profile-panel';

/** The rail item the panel lines up with. */
export const PROFILE_RAIL_ITEM_ATTRIBUTE = 'data-rail-profile';

const Dim = styled.div`
  position: fixed;
  inset: 0;
  /* Below the rail and the app logo (1002). */
  z-index: 1001;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
`;

/** Starts right at the rail's edge, so the pointer can travel from the avatar into the panel. */
const HoverZone = styled.div<{ $railExpanded: boolean }>`
  --rail-width: ${({ $railExpanded }) =>
    $railExpanded ? RAIL_EXPANDED_WIDTH_CSS : RAIL_COLLAPSED_WIDTH_CSS};
  position: fixed;
  z-index: 1003;
  left: var(--rail-width);
  outline: none;
`;

const Panel = styled.section`
  width: min(340px, calc(100vw - var(--rail-width) - 24px));
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: #151515;
  color: ${PALETTE.text.primary};
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 6px;

  h2 {
    margin: 0;
    overflow: hidden;
    font-family: inherit;
    font-size: 1.15rem;
    font-weight: 600;
    text-overflow: ellipsis;
    text-transform: none;
    white-space: nowrap;
  }

  p {
    margin: 2px 0 0;
    color: ${PALETTE.text.muted};
    font-size: 0.8rem;
  }
`;

const HeaderText = styled.div`
  min-width: 0;
`;

const Avatar = styled.div`
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
`;

const Row = styled.button`
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1rem;
  text-align: left;
  cursor: pointer;

  svg {
    width: 100%;
    height: auto;
  }

  svg:last-child {
    color: ${PALETTE.text.muted};
  }

  &:hover,
  &:focus,
  &:focus-visible {
    outline: none;
    background: rgba(255, 255, 255, 0.09);
  }
`;

const Separator = styled.hr`
  margin: 6px 12px;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

export interface ProfileMenuProps {
  profile: SessionInfo;
  /** The keyboard is in the panel (rather than on the rail). */
  focused: boolean;
  railExpanded: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  /** Sign this profile out of the device. */
  onLogout: () => void;
  /** Left or Back: hand the keyboard back to the rail, keeping the panel open. */
  onExit: () => void;
  onPointerEnter: () => void;
  /** The pointer left for the page (not the rail). */
  onPointerLeave: () => void;
}

const ROW = '[data-profile-menu-row]';

const rowsIn = (zone: HTMLElement | null) => [...(zone?.querySelectorAll<HTMLElement>(ROW) ?? [])];

/** Focus the panel's first option. */
function focusFirstIn(zone: HTMLElement | null): boolean {
  const [first] = rowsIn(zone);
  first?.focus({ preventScroll: true });
  return Boolean(first);
}

/**
 * How far the rail's profile item sits from the bottom of the window: null until measured, the
 * rail's bottom inset when there is no item to line up with.
 */
function useRailItemBottom(): number | string | null {
  const [bottom, setBottom] = useState<number | string | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const item = document.querySelector(`[${PROFILE_RAIL_ITEM_ATTRIBUTE}]`);
      setBottom(item ? window.innerHeight - item.getBoundingClientRect().bottom : '3vh');
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return bottom;
}

/** The profile panel beside the rail: who is watching, and switching or editing the profile. */
export const ProfileMenu: FC<ProfileMenuProps> = ({
  profile,
  focused,
  railExpanded,
  onSwitch,
  onEdit,
  onLogout,
  onExit,
  onPointerEnter,
  onPointerLeave,
}) => {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const bottom = useRailItemBottom();

  // Entering the panel lands on its first option, like the rail lands on its item. Hidden until
  // measured, the panel can only take focus once it is placed.
  const placed = bottom !== null;
  useEffect(() => {
    if (focused && placed && !zoneRef.current?.contains(document.activeElement))
      focusFirstIn(zoneRef.current);
  }, [focused, placed]);

  const move = (direction: -1 | 1) => {
    const items = rowsIn(zoneRef.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[index === -1 ? 0 : index + direction]?.focus({ preventScroll: true });
    return true;
  };

  const navigationRef = useKeyboardNavigation({
    enabled: focused,
    onRestoreFocus: () => focusFirstIn(zoneRef.current),
    onUp: () => move(-1),
    onDown: () => move(1),
    onLeft: () => {
      onExit();
      return true;
    },
    onBack: () => {
      onExit();
      return true;
    },
    onRight: () => true,
    onConfirm: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && zoneRef.current?.contains(active)) active.click();
      return true;
    },
  });

  const leftForRail = (event: MouseEvent) =>
    event.relatedTarget instanceof Element && !!event.relatedTarget.closest('[data-home-rail]');

  const name = profile.user.displayName || profile.user.email;
  return (
    <>
      <Dim aria-hidden="true" />
      <HoverZone
        ref={node => {
          zoneRef.current = node;
          navigationRef(node);
        }}
        {...{ [PROFILE_PANEL_ATTRIBUTE]: '' }}
        $railExpanded={railExpanded}
        tabIndex={-1}
        // Bottom-aligned with the avatar on the rail; hidden for the moment before it is measured
        style={{ bottom: bottom ?? undefined, visibility: bottom === null ? 'hidden' : undefined }}
        onMouseEnter={onPointerEnter}
        onMouseLeave={event => {
          if (!leftForRail(event)) onPointerLeave();
        }}
      >
        <Panel aria-label="Profile">
          <Header>
            <Avatar aria-hidden="true">
              <ProfileAvatar user={profile.user} session={profile.session} />
            </Avatar>
            <HeaderText>
              <h2>{name}</h2>
              <p>Watching now</p>
            </HeaderText>
          </Header>
          <Row
            type="button"
            data-profile-menu-row=""
            onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
            onClick={onSwitch}
          >
            <SwitchIcon aria-hidden="true" />
            Switch profile
            <ChevronIcon aria-hidden="true" />
          </Row>
          <Row
            type="button"
            data-profile-menu-row=""
            onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
            onClick={onEdit}
          >
            <EditIcon aria-hidden="true" />
            Edit profile
            <ChevronIcon aria-hidden="true" />
          </Row>
          <Separator />
          <Row
            type="button"
            data-profile-menu-row=""
            onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
            onClick={onLogout}
          >
            <LogoutIcon aria-hidden="true" />
            Logout
            <span />
          </Row>
        </Panel>
      </HoverZone>
    </>
  );
};
