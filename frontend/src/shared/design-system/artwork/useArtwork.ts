import { useEffect, useState } from 'react';

import type { ArtworkProps } from './Artwork';

/**
 * What both of Artwork's views do with the image's status: report a failure or a load once per
 * source, and hold the last loaded image while a newer one loads (`holdPrevious`).
 */
export function useArtwork(
  { src, alt = '', holdPrevious = false, onError, onLoad }: ArtworkProps,
  { failed, loaded }: { failed: boolean; loaded: boolean }
) {
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);
  const loading = Boolean(src) && !loaded && !failed;
  // A newer picture replacing one that loaded before: the old one stays in view until the new one
  // has loaded, which then shows at once (fading in would uncover the box under both)
  const replacing = holdPrevious && lastLoaded !== null && lastLoaded !== src;
  const held = replacing && loading ? lastLoaded : null;
  useEffect(() => {
    if (failed && src) onError?.();
    // Once per failing source; a new callback for the same failure is not a new failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, src]);
  useEffect(() => {
    if (!loaded || !src) return;
    setLastLoaded(src);
    onLoad?.();
    // Once per loaded source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, src]);
  return {
    replacing,
    held,
    /** A described image keeps its description when the picture is missing or fails. */
    describedFallback: (failed || !src) && alt !== '',
  };
}
