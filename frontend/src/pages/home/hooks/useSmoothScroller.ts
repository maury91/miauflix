import { useCallback, useRef } from 'react';

import { createSmoothScroller, type SmoothScroller } from '../smooth-scroll';

/**
 * A callback ref for a scrollable element plus a stable `scrollTo` that animates it on `axis`.
 * The first scroll after an element attaches jumps instead, so a remounted list opens where it
 * was left. Calls while no element is attached are ignored.
 */
export function useSmoothScroller(axis: 'x' | 'y') {
  const scroller = useRef<SmoothScroller | null>(null);
  const element = useRef<HTMLDivElement | null>(null);
  const scrolled = useRef(false);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current?.dispose();
      scroller.current = node ? createSmoothScroller(node, axis) : null;
      element.current = node;
      scrolled.current = false;
    },
    [axis]
  );
  const scrollTo = useCallback((target: number, options?: { instant?: boolean }) => {
    if (!scroller.current) return;
    const firstScroll = !scrolled.current;
    scrolled.current = true;
    scroller.current.scrollTo(target, firstScroll ? { ...options, instant: true } : options);
  }, []);
  return { ref, element, scrollTo };
}
