import type { UserDto } from '@miauwatch/backend';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadAvatarImage } from '../api/profiles.api';
import { lookFor } from './look';
import { liveAvatarsSupported } from './runtime';

export interface ProfilePicture {
  /** The profile's look: its colour fills the avatar until a picture shows. */
  look: ReturnType<typeof lookFor>;
  /** Draw the live Plushie (the device can and the caller asked for it). */
  showLive: boolean;
  /** The pre-rendered picture's URL once loaded, when not live. */
  picture: string | null;
  /** The live Plushie failed: fall back to the picture. */
  onLiveError: () => void;
}

/** Which of a profile's pictures to show: the live Plushie, the pre-rendered picture or none yet. */
export function useProfilePicture(user: UserDto, session: string, live: boolean): ProfilePicture {
  const look = useMemo(() => lookFor(user.avatar, user.id), [user.avatar, user.id]);
  const [liveFailed, setLiveFailed] = useState(false);
  // Whoever asks for live has already decided about TVs; this only checks the device can draw.
  const showLive = live && !liveFailed && liveAvatarsSupported({ onTv: true });
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

  const onLiveError = useCallback(() => setLiveFailed(true), []);
  return { look, showLive, picture, onLiveError };
}
