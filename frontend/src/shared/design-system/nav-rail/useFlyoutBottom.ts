import { useLayoutEffect, useState } from 'react';

/**
 * Lines a NavRail flyout panel up with the rail item it belongs to (the profile, Settings): how far
 * the element matching `anchorSelector` sits from the bottom of the window, null until measured,
 * or `fallback` when there is no such item. Measured on mount and on resize.
 */
export function useFlyoutBottom(
  anchorSelector: string,
  fallback: string = '3vh'
): number | string | null {
  const [bottom, setBottom] = useState<number | string | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const item = document.querySelector(anchorSelector);
      setBottom(item ? window.innerHeight - item.getBoundingClientRect().bottom : fallback);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchorSelector, fallback]);
  return bottom;
}
