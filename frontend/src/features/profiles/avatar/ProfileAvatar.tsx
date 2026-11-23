import type { UserDto } from '@miauwatch/backend';
import { memo } from 'react';

import * as styles from './avatar.css';
import { PlushieLive } from './PlushieLive';
import { useProfilePicture } from './useProfilePicture';

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
  const { look, showLive, picture, onLiveError } = useProfilePicture(user, session, live);

  return (
    <div
      className={className ? `${styles.frame} ${className}` : styles.frame}
      data-avatar={showLive ? 'live' : picture ? 'picture' : 'color'}
    >
      {showLive ? (
        <PlushieLive look={look} animated={animated} hopSignal={hopSignal} onError={onLiveError} />
      ) : picture ? (
        <img className={styles.picture} src={picture} alt="" draggable={false} />
      ) : (
        <div
          className={styles.placeholder}
          style={{ backgroundColor: look.color }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});
