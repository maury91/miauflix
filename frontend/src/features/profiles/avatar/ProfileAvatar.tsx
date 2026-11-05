import type { UserDto } from '@miauflix/backend';
import { memo, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { loadAvatarImage } from '../api/profiles.api';
import { lookFor } from './look';
import { PlushieLive } from './PlushieLive';
import { liveAvatarsSupported } from './runtime';

const Frame = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

const Picture = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

/** Shown until (or instead of) a picture: a soft blob in the profile's colour. */
const Placeholder = styled.div<{ $color: string }>`
  position: absolute;
  inset: 14% 18% 10%;
  border-radius: 46% 46% 42% 42%;
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.35), transparent 55%),
    ${({ $color }) => $color};
`;

export interface ProfileAvatarProps {
  user: UserDto;
  /** A session of this device allowed to read the pre-rendered picture. */
  session: string;
  /** Draw the live Plushie when the device can; otherwise the pre-rendered picture. */
  live?: boolean;
  /** Animate the live Plushie now and then. */
  animated?: boolean;
  hopSignal?: number;
  className?: string;
}

/** A profile's Plushie: live where the device can draw it, its picture elsewhere. */
export const ProfileAvatar = memo(function ProfileAvatar({
  user,
  session,
  live = false,
  animated = false,
  hopSignal,
  className,
}: ProfileAvatarProps) {
  const look = useMemo(() => lookFor(user.avatar, user.id), [user.avatar, user.id]);
  const [liveFailed, setLiveFailed] = useState(false);
  const showLive = live && !liveFailed && liveAvatarsSupported();
  const [picture, setPicture] = useState<string | null>(null);

  useEffect(() => {
    if (showLive || user.avatarVersion == null) {
      setPicture(null);
      return undefined;
    }
    let current = true;
    void loadAvatarImage(session, user.id, user.avatarVersion).then(url => {
      if (current) setPicture(url);
    });
    return () => {
      current = false;
    };
  }, [session, showLive, user.avatarVersion, user.id]);

  return (
    <Frame className={className} data-avatar={showLive ? 'live' : picture ? 'picture' : 'color'}>
      {showLive ? (
        <PlushieLive
          look={look}
          animated={animated}
          hopSignal={hopSignal}
          onError={() => setLiveFailed(true)}
        />
      ) : picture ? (
        <Picture src={picture} alt="" draggable={false} />
      ) : (
        <Placeholder $color={look.color} aria-hidden="true" />
      )}
    </Frame>
  );
});
