import { useAppDispatch } from '@store/hooks';
import type { SessionInfo } from '@store/slices/auth';
import { useEffect } from 'react';

import { profilesApi } from '../api/profiles.api';
import { lookFor } from './look';
import { liveAvatarsSupported } from './runtime';
import { renderPlushieSnapshot } from './snapshot';

/** Profiles tried in this app run, so a failed render or upload is not retried in a loop. */
const attempted = new Set<string>();

/**
 * Draw and upload the picture of profiles whose look has none yet: looks the server generated
 * (new accounts, accounts from before profiles) until a device that can draw Plushies sees them.
 * Devices that cannot draw them, like TVs, then show the picture too.
 */
export function useMissingProfilePictures(profiles: readonly SessionInfo[], enabled = true): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!enabled || !liveAvatarsSupported()) return undefined;
    const missing = profiles.filter(
      ({ user }) => user.avatar && user.avatarVersion == null && !attempted.has(user.id)
    );
    if (!missing.length) return undefined;
    let stopped = false;
    void (async () => {
      // One at a time: each render mounts a WebGL viewer.
      for (const { session, user } of missing) {
        if (stopped) return;
        attempted.add(user.id);
        const image = await renderPlushieSnapshot(lookFor(user.avatar, user.id));
        if (stopped) {
          // Interrupted before uploading: a later run may try again.
          attempted.delete(user.id);
          return;
        }
        if (image)
          await dispatch(profilesApi.endpoints.uploadProfilePicture.initiate({ session, image }));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [dispatch, enabled, profiles]);
}

/** For tests: forget which profiles were tried. */
export function resetMissingProfilePictures(): void {
  attempted.clear();
}
