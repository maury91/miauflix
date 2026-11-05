import type { UserDto } from '@miauflix/backend';
import { forwardRef, useEffect, useState } from 'react';
import styled, { css } from 'styled-components';

import { ProfileAvatar } from '../avatar/ProfileAvatar';
import { NAV_ATTRIBUTE } from './spatialFocus';

import EditIcon from '~icons/mdi/pencil-outline';
import PlusIcon from '~icons/mdi/plus';

const CARD = 'clamp(150px, 15.5vw, 300px)';

const Card = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.1rem;
  padding: 0;
  border: 0;
  background: none;
  color: #f5f5f5;
  font: inherit;
  cursor: pointer;
  outline: none;
`;

const highlighted = css`
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.04);
  transform: scale(1.06);
`;

/** Highlighted while its card has focus (tracked from focus events, like the Home rail). */
const Tile = styled.div<{ $focused: boolean }>`
  position: relative;
  width: ${CARD};
  height: ${CARD};
  border: 4px solid transparent;
  border-radius: 22px;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
  ${({ $focused }) => $focused && highlighted}

  ${Card}:hover & {
    ${highlighted}
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const AddTile = styled(Tile)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(${CARD} * 0.8);
  height: calc(${CARD} * 0.8);
  margin: calc(${CARD} * 0.1);
  border-color: ${({ $focused }) => ($focused ? '#ffffff' : 'rgba(255, 255, 255, 0.45)')};
  color: ${({ $focused }) => ($focused ? '#ffffff' : 'rgba(255, 255, 255, 0.6)')};
  font-size: calc(${CARD} * 0.36);

  ${Card}:hover & {
    color: #ffffff;
  }
`;

const EditBadge = styled.span`
  position: absolute;
  right: 8%;
  bottom: 8%;
  display: grid;
  place-items: center;
  width: 22%;
  height: 22%;
  border-radius: 50%;
  background: rgba(10, 13, 15, 0.82);
  border: 2px solid rgba(255, 255, 255, 0.7);
  font-size: calc(${CARD} * 0.11);
`;

const Name = styled.span`
  max-width: ${CARD};
  overflow: hidden;
  font-size: clamp(1rem, 1.7vw, 2rem);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;

  ${Card}:hover &,
  ${Card}[data-focused] & {
    opacity: 1;
  }
`;

export interface ProfileCardProps {
  user: UserDto;
  session: string;
  live: boolean;
  /** Manage mode shows a pencil on each profile. */
  editing?: boolean;
  /** The remote's highlight is on this card. */
  focused: boolean;
  onActivate: () => void;
}

/** One profile on Who's watching; its Plushie hops when the card is focused. */
export const ProfileCard = forwardRef<HTMLButtonElement, ProfileCardProps>(function ProfileCard(
  { user, session, live, editing = false, focused, onActivate },
  ref
) {
  const [hops, setHops] = useState(0);
  // Hop each time the highlight arrives.
  useEffect(() => {
    if (focused) setHops(count => count + 1);
  }, [focused]);
  const name = user.displayName || user.email;
  return (
    <Card
      ref={ref}
      type="button"
      {...{ [NAV_ATTRIBUTE]: '' }}
      data-profile-id={user.id}
      data-focused={focused || undefined}
      aria-label={editing ? `Edit ${name}` : name}
      onMouseEnter={() => setHops(count => count + 1)}
      onClick={onActivate}
    >
      <Tile $focused={focused}>
        <ProfileAvatar user={user} session={session} live={live} animated hopSignal={hops} />
        {editing && (
          <EditBadge aria-hidden="true">
            <EditIcon />
          </EditBadge>
        )}
      </Tile>
      <Name>{name}</Name>
    </Card>
  );
});

export const AddProfileCard = forwardRef<
  HTMLButtonElement,
  { focused: boolean; onActivate: () => void }
>(function AddProfileCard({ focused, onActivate }, ref) {
  return (
    <Card
      ref={ref}
      type="button"
      {...{ [NAV_ATTRIBUTE]: '' }}
      data-profile-id="add"
      data-focused={focused || undefined}
      onClick={onActivate}
    >
      <AddTile aria-hidden="true" $focused={focused}>
        <PlusIcon />
      </AddTile>
      <Name>Add profile</Name>
    </Card>
  );
});
