import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function that keeps its identity across renders and always calls the latest `callback`,
 * so passing it down doesn't defeat a memoized child. Don't call it during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
