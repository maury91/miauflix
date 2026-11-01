import { useEffect, useRef, useState } from 'react';

/**
 * `value`, once it has stayed the same (by `key`) for `delayMs`. The first value, a value
 * following an empty key, and every value when `delayMs` is 0 apply at once.
 */
export function useRestingValue<T>(value: T, key: string, delayMs: number): T {
  const [resting, setResting] = useState({ value, key });
  const latest = useRef({ value, key });
  latest.current = { value, key };
  const immediate = delayMs <= 0 || !resting.key;

  useEffect(() => {
    if (key === resting.key) return;
    if (immediate) {
      setResting(latest.current);
      return;
    }
    const timeout = window.setTimeout(() => setResting(latest.current), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, immediate, key, resting.key]);

  // Same key: the latest value (its other fields may have changed); applied at once: no lag.
  if (key === resting.key || immediate) return value;
  return resting.value;
}
