import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the rested row waits for the slide to end before it follows anyway. */
const FALLBACK_MS = 1000;

/**
 * The focused row once the slide to it has ended: `rested()` reports the end (the scroller's
 * onRest), and a move that does not slide catches up after a second. While disabled, the focused
 * row itself.
 */
export function useRestedRow(activeRow: number, enabled: boolean) {
  const [restedRow, setRestedRow] = useState(activeRow);
  const latest = useRef(activeRow);
  latest.current = activeRow;

  useEffect(() => {
    if (!enabled || restedRow === activeRow) return;
    const timeout = window.setTimeout(() => setRestedRow(latest.current), FALLBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [activeRow, enabled, restedRow]);

  const rested = useCallback(() => setRestedRow(latest.current), []);
  return { restedRow: enabled ? restedRow : activeRow, rested };
}
