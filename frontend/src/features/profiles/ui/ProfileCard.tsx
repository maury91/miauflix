import type { UserDto } from '@miauflix/backend';
import { ProfileTile } from '@shared/design-system';
import { useCallback, useEffect, useState } from 'react';

import { PlushieLive } from '../avatar/PlushieLive';
import { useProfilePicture } from '../avatar/useProfilePicture';

import PlusIcon from '~icons/mdi/plus';

export interface ProfileCardProps {
  navId: string;
  user: UserDto;
  session: string;
  live: boolean;
  /** Virtual focus is on this card: its Plushie hops as it arrives. */
  focused: boolean;
  onActivate: () => void;
}

/**
 * One profile on Who's watching: a ProfileTile showing the live Plushie where the device can draw
 * it (hopping each time focus arrives), the pre-rendered picture elsewhere.
 */
export function ProfileCard({ navId, user, session, live, focused, onActivate }: ProfileCardProps) {
  const { look, showLive, picture, onLiveError } = useProfilePicture(user, session, live);
  const [hops, setHops] = useState(0);
  // The colour and placeholder (or the picture) show until the live Plushie has drawn itself
  const [liveReady, setLiveReady] = useState(false);
  const onLiveReady = useCallback(() => setLiveReady(true), []);
  useEffect(() => {
    if (!showLive) setLiveReady(false);
  }, [showLive]);
  useEffect(() => {
    if (focused) setHops(count => count + 1);
  }, [focused]);
  return (
    <ProfileTile
      navId={navId}
      data-profile-id={user.id}
      name={user.displayName || user.email}
      avatar={picture}
      picture={
        showLive ? (
          <PlushieLive
            look={look}
            animated
            hopSignal={hops}
            onReady={onLiveReady}
            onError={onLiveError}
          />
        ) : undefined
      }
      pictureLoaded={liveReady}
      fit="contain"
      color={look.color}
      onClick={onActivate}
    />
  );
}

/** Adds a profile to the device (administrators only). */
export function AddProfileCard({ navId, onActivate }: { navId: string; onActivate: () => void }) {
  return (
    <ProfileTile
      navId={navId}
      data-profile-id="add"
      name="Add profile"
      placeholder={<PlusIcon />}
      onClick={onActivate}
    />
  );
}
