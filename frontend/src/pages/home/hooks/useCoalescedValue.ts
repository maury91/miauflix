import { useEffect, useRef, useState } from 'react';

/**
 * `value`, reported at most once per burst of changes: a change after `delayMs` without one
 * applies at once; changes in quicker succession (a held key) apply when they pause for `delayMs`.
 * With `delayMs` 0 every value applies at once.
 */
export function useCoalescedValue<T>(value: T, delayMs: number): T {
  const [shown, setShown] = useState(value);
  const lastChange = useRef(Number.NEGATIVE_INFINITY);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (delayMs <= 0 || Object.is(value, shown)) return;
    const now = performance.now();
    const quiet = now - lastChange.current >= delayMs;
    lastChange.current = now;
    if (quiet) {
      setShown(value);
      return;
    }
    const timeout = window.setTimeout(() => setShown(latest.current), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, shown, value]);

  return delayMs <= 0 ? value : shown;
}
