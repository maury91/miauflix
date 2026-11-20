/**
 * The engine's motion preference: with `prefers-reduced-motion`, animations land at once (their
 * settle callbacks still run, on the next frame), fade-ins are skipped and spinners stand still.
 * Set by the GlSurface from the media query; one setting for every surface.
 */
export const motion = {
  reduced: false,
};

/** An animation's duration under the motion preference. */
export function motionDuration(duration: number) {
  return motion.reduced ? 0 : duration;
}

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Follows the media query into `motion.reduced` (and calls `onChange` when it changes). Returns
 * the unsubscribe. Chromium 69 has `addListener`, not `addEventListener`, on a MediaQueryList.
 */
export function followReducedMotion(onChange?: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(QUERY);
  motion.reduced = query.matches;
  const listener = () => {
    motion.reduced = query.matches;
    onChange?.();
  };
  query.addListener(listener);
  return () => query.removeListener(listener);
}
