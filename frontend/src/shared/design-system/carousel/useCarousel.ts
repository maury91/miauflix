import { useComposite, useHasNavigation } from '@shared/navigation/hooks';
import { type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { duration } from '../tokens';
import type { CarouselProps } from './Carousel';
import { maxLeading, useCarouselPosition } from './carouselNavigation';

/** How long after the track starts moving the pointer is locked: the translate plus a frame. */
const POINTER_LOCK_MS = parseFloat(duration.fast) + 30;
/** GL releases the lock when the track lands; this bounds it if no frame runs (a hidden page). */
const GL_POINTER_LOCK_MAX_MS = 1000;

/**
 * What both of Carousel's views need: the row's navigation composite, the focused and leading
 * items, the pointer (locked while the track moves), the item size and which items are mounted.
 */
export function useCarousel(
  {
    count,
    geometry,
    itemHeight,
    focusedIndex: focusedIndexProp = null,
    leadingIndex: leadingIndexProp,
    onPointerFocus: onPointerFocusProp,
    overscan,
    navId,
    navigation,
    hasMore = false,
    onLoadMore,
  }: CarouselProps,
  /** `settle`: the view calls `releasePointer` when the track lands (GL, whose frames can lag). */
  { pointerLock = 'timer' }: { pointerLock?: 'timer' | 'settle' } = {}
) {
  const layered = useHasNavigation() && navId !== undefined && navigation !== undefined;
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;
  const parts = useMemo(() => Array.from({ length: count }, (_, index) => String(index)), [count]);
  const composite = useComposite<HTMLElement>(layered ? navId : undefined, parts, {
    stepPart: (_part, direction) => {
      const current = latestNavigation.current;
      const next = current?.peek(direction) ?? null;
      if (next === null) return null;
      current?.move(direction);
      return String(next);
    },
    entryPart: () =>
      latestNavigation.current ? String(latestNavigation.current.position().focused) : undefined,
    more: { end: hasMore },
    onMore: onLoadMore,
  });
  const focusedIndex = layered
    ? composite.focusedPart === undefined
      ? null
      : Number(composite.focusedPart)
    : focusedIndexProp;
  // The row's owner doesn't re-render on a move: the carousel reads the track's position itself
  const navigationLeading = useCarouselPosition(navigation, position => position.leading);
  const leadingIndex = leadingIndexProp ?? navigationLeading ?? 0;
  const onPointerFocus = (index: number) => {
    if (layered) {
      navigation?.pointerFocus(index);
      composite.onPointerFocus(String(index));
    }
    onPointerFocusProp?.(index);
  };
  const { itemWidth, perPage } = geometry;
  const height = itemHeight ?? (itemWidth * 9) / 16;
  const extra = overscan ?? perPage;

  // Pointer lock: the track moved, so content slides under a resting pointer
  const pointer = useRef({ locked: false, x: NaN, y: NaN, timer: 0 });
  const previousLeading = useRef(leadingIndex);
  useLayoutEffect(() => {
    if (previousLeading.current === leadingIndex) return;
    previousLeading.current = leadingIndex;
    const state = pointer.current;
    state.locked = true;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(
      () => {
        state.locked = false;
      },
      pointerLock === 'settle' ? GL_POINTER_LOCK_MAX_MS : POINTER_LOCK_MS
    );
  }, [leadingIndex, pointerLock]);
  useEffect(() => () => window.clearTimeout(pointer.current.timer), []);
  const releasePointer = useCallback(() => {
    const state = pointer.current;
    state.locked = false;
    window.clearTimeout(state.timer);
  }, []);

  // Set after commit: a render React discards must not leave its callback here
  const onPointerFocusRef = useRef(onPointerFocus);
  useLayoutEffect(() => {
    onPointerFocusRef.current = onPointerFocus;
  });
  const handlePointer = useCallback((index: number, event: MouseEvent) => {
    const state = pointer.current;
    const moved = event.clientX !== state.x || event.clientY !== state.y;
    state.x = event.clientX;
    state.y = event.clientY;
    if (state.locked || !moved) return;
    onPointerFocusRef.current?.(index);
  }, []);

  return {
    composite,
    focusedIndex,
    leadingIndex,
    handlePointer,
    /** Unlocks the pointer: the track landed (`pointerLock: 'settle'`). */
    releasePointer,
    /** Item height (px). */
    height,
    /** Mounted items: a margin of `overscan` beyond the visible ones. */
    first: Math.max(0, leadingIndex - extra),
    last: Math.min(count - 1, leadingIndex + perPage - 1 + extra),
    canGoBack: leadingIndex > 0,
    canGoForward: leadingIndex < maxLeading({ count, perPage }),
  };
}
