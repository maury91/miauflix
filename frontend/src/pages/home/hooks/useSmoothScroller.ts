import { useCallback, useRef } from 'react';

import { createSmoothScroller, type SmoothScroller } from '../smooth-scroll';

/**
 * A callback ref for a scrollable element plus a stable `scrollTo` that animates it on `axis`.
 * The first scroll after an element attaches jumps instead, so a remounted list opens where it
 * was left. Calls while no element is attached are ignored. With `transform`, the element is
 * moved with a transform instead of scrolled (see SmoothScrollerOptions), and `onRest` reports
 * where scroll events would.
 */
export function useSmoothScroller(
  axis: 'x' | 'y',
  { transform = false, onRest }: { transform?: boolean; onRest?: () => void } = {}
) {
  const scroller = useRef<SmoothScroller | null>(null);
  const element = useRef<HTMLDivElement | null>(null);
  const scrolled = useRef(false);
  const latestOnRest = useRef(onRest);
  latestOnRest.current = onRest;

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      scroller.current?.dispose();
      scroller.current = node
        ? createSmoothScroller(
            node,
            axis,
            transform ? { transform, onRest: () => latestOnRest.current?.() } : undefined
          )
        : null;
      element.current = node;
      scrolled.current = false;
    },
    [axis, transform]
  );
  const scrollTo = useCallback((target: number, options?: { instant?: boolean }) => {
    if (!scroller.current) return;
    const firstScroll = !scrolled.current;
    scrolled.current = true;
    scroller.current.scrollTo(target, firstScroll ? { ...options, instant: true } : options);
  }, []);
  /** The current scroll offset or translation; 0 while no element is attached. */
  const position = useCallback(() => scroller.current?.position() ?? 0, []);
  return { ref, element, scrollTo, position };
}
