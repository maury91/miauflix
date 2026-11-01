import { useEffect, useState } from 'react';

/** How long without a key press before Home starts readying rows. */
const IDLE_BEFORE_WARMUP_MS = 1000;
/** Between rows, while still idle: each row's render takes the TV a moment of its own. */
const WARMUP_STEP_MS = 500;

/**
 * The last row Home has readied below the visible ones (see RowLoadState.warm): one row further
 * each step while no key is pressed, up to `maxRows` below the visible rows. A key press pauses
 * it. Counted in rows, not from the focused row, so moving down uses the readied rows instead of
 * readying a new one on every move. -1 while disabled.
 */
export function useIdleRowWarmup(
  enabled: boolean,
  activeCategory: number,
  maxRows: number
): number {
  const [warmUntil, setWarmUntil] = useState(-1);
  const lastVisible = activeCategory + 1;
  const limit = lastVisible + maxRows;

  useEffect(() => {
    if (!enabled || warmUntil >= limit) return;
    const step = () => setWarmUntil(current => Math.min(limit, Math.max(current, lastVisible) + 1));
    let timeout = window.setTimeout(
      step,
      warmUntil > lastVisible ? WARMUP_STEP_MS : IDLE_BEFORE_WARMUP_MS
    );
    const onKey = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(step, IDLE_BEFORE_WARMUP_MS);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [enabled, lastVisible, limit, warmUntil]);

  return enabled ? warmUntil : -1;
}
