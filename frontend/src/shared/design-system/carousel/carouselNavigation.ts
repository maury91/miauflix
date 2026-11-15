import { useCallback, useState } from 'react';

/** Where a carousel is: the focused item and the item in its left-most (leading) visible slot. */
export interface CarouselPosition {
  focused: number;
  leading: number;
}

export interface CarouselLayout {
  count: number;
  perPage: number;
  /**
   * `item`: Left/Right move one item and bring it to the leading slot (Home today). `page`: they
   * scroll by a page and focus the item landing in the leading slot.
   */
  paging: 'item' | 'page';
}

/** The furthest leading slot: the last page is full, never followed by empty space. */
export const maxLeading = ({ count, perPage }: Pick<CarouselLayout, 'count' | 'perPage'>) =>
  Math.max(0, count - perPage);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * One Left (-1) or Right (+1) press. Returns the next position, or `null` at an edge, where the
 * press exits the carousel (the navigation layer moves to whatever is beyond).
 */
export function stepCarousel(
  position: CarouselPosition,
  direction: -1 | 1,
  layout: CarouselLayout
): CarouselPosition | null {
  const { count, perPage, paging } = layout;
  if (count === 0) return null;
  const last = maxLeading(layout);
  if (paging === 'item') {
    const focused = position.focused + direction;
    if (focused < 0 || focused >= count) return null;
    return { focused, leading: clamp(focused, 0, last) };
  }
  const leading = clamp(position.leading + direction * perPage, 0, last);
  if (leading !== position.leading) return { focused: leading, leading };
  // On the first or last page: move item by item to the end, then exit
  const focused = position.focused + direction;
  if (focused < 0 || focused >= count) return null;
  return { focused, leading };
}

/** Make `index` focused and visible, moving the track only if it is out of view. */
export function revealItem(
  position: CarouselPosition,
  index: number,
  layout: CarouselLayout
): CarouselPosition {
  const focused = clamp(index, 0, Math.max(0, layout.count - 1));
  // A shorter row (fewer items) may have moved the furthest leading slot below the kept one
  const leading = clamp(position.leading, 0, maxLeading(layout));
  if (focused >= leading && focused < leading + layout.perPage) return { focused, leading };
  return { focused, leading: clamp(focused, 0, maxLeading(layout)) };
}

/**
 * Carousel state for one row: the focused item and the track's position. Keys move both; the
 * pointer moves focus only (never scrolls); `reveal` restores a remembered item.
 */
export function useCarouselNavigation(layout: CarouselLayout, initialIndex = 0) {
  const [position, setPosition] = useState<CarouselPosition>(() =>
    revealItem({ focused: 0, leading: 0 }, initialIndex, layout)
  );
  // The item count can shrink under the focus (a reload): keep both inside it. A smaller page (a
  // resize) also brings the focused item back into view; otherwise an item outside the page stays
  // where it is, since the pointer focuses peeking items without scrolling. revealItem's result
  // satisfies every condition, so this settles after one update.
  const [pagedBy, setPagedBy] = useState(layout.perPage);
  const resized = pagedBy !== layout.perPage;
  if (resized) setPagedBy(layout.perPage);
  const outOfView =
    position.focused < position.leading || position.focused >= position.leading + layout.perPage;
  const bounded =
    layout.count > 0 &&
    (position.focused >= layout.count ||
      position.leading > maxLeading(layout) ||
      (resized && outOfView))
      ? revealItem(position, position.focused, layout)
      : position;
  if (bounded !== position) setPosition(bounded);

  const { count, perPage, paging } = layout;
  /** A Left/Right press; `false` when it exits the carousel. */
  const move = useCallback(
    (direction: -1 | 1) => {
      const next = stepCarousel(bounded, direction, { count, perPage, paging });
      if (next) setPosition(next);
      return next !== null;
    },
    [bounded, count, perPage, paging]
  );
  /** A page of the pointer's previous/next buttons: scroll and focus the new leading item. */
  const page = useCallback(
    (direction: -1 | 1) => {
      const leading = clamp(
        bounded.leading + direction * perPage,
        0,
        maxLeading({ count, perPage })
      );
      setPosition({ focused: leading, leading });
    },
    [bounded.leading, count, perPage]
  );
  const pointerFocus = useCallback(
    (index: number) => setPosition(current => ({ ...current, focused: index })),
    []
  );
  const reveal = useCallback(
    (index: number) =>
      setPosition(current => revealItem(current, index, { count, perPage, paging })),
    [count, perPage, paging]
  );

  return {
    focusedIndex: bounded.focused,
    leadingIndex: bounded.leading,
    move,
    page,
    pointerFocus,
    reveal,
  };
}
