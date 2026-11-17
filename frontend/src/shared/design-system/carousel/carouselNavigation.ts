import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

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

/** A position outside the layout (a reload shrank the row, a resize changed the page) brought back. */
function boundPosition(
  position: CarouselPosition,
  layout: CarouselLayout,
  resized: boolean
): CarouselPosition {
  // The item count can shrink under the focus (a reload): keep both inside it. A smaller page (a
  // resize) also brings the focused item back into view; otherwise an item outside the page stays
  // where it is, since the pointer focuses peeking items without scrolling.
  const outOfView =
    position.focused < position.leading || position.focused >= position.leading + layout.perPage;
  return layout.count > 0 &&
    (position.focused >= layout.count ||
      position.leading > maxLeading(layout) ||
      (resized && outOfView))
    ? revealItem(position, position.focused, layout)
    : position;
}

/**
 * One row's position, outside React: a key moves it without re-rendering the row's owner. Only
 * the components that read it (`useCarouselPosition`) render again, and only when what they read
 * changed.
 */
export interface CarouselNavigation {
  /** The focused item and the leading slot now. The same object until either changes. */
  position: () => CarouselPosition;
  /** Called after every change of `position()`. Returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** A Left/Right press; `false` when it exits the carousel. */
  move: (direction: -1 | 1) => boolean;
  /** Where a Left/Right press would focus, without moving (null when it exits). */
  peek: (direction: -1 | 1) => number | null;
  /** A page of the pointer's previous/next buttons: scroll and focus the new leading item. */
  page: (direction: -1 | 1) => void;
  /** The pointer focused an item: focus moves, the track doesn't. */
  pointerFocus: (index: number) => void;
  /** Make an item focused and visible (a remembered item). */
  reveal: (index: number) => void;
}

interface CarouselStore extends CarouselNavigation {
  /** The layout of this render: bounds the position, without notifying (see useCarouselNavigation). */
  setLayout: (layout: CarouselLayout) => void;
  /** Tells subscribers of a position a layout bounded since the last call, if any. */
  flushLayoutChange: () => void;
}

function createCarouselStore(initialLayout: CarouselLayout, initialIndex: number): CarouselStore {
  let layout = initialLayout;
  // A row whose size isn't known yet (its first page is loading) keeps the item it starts on, at
  // the leading slot; the bounds apply once the count arrives
  let position: CarouselPosition =
    layout.count > 0
      ? revealItem({ focused: 0, leading: 0 }, initialIndex, layout)
      : { focused: Math.max(0, initialIndex), leading: Math.max(0, initialIndex) };
  let boundedByLayout = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const set = (next: CarouselPosition) => {
    if (next.focused === position.focused && next.leading === position.leading) return;
    position = next;
    notify();
  };

  return {
    position: () => position,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setLayout: next => {
      if (
        next.count === layout.count &&
        next.perPage === layout.perPage &&
        next.paging === layout.paging
      )
        return;
      const resized = next.perPage !== layout.perPage;
      layout = next;
      const bounded = boundPosition(position, layout, resized);
      if (bounded === position) return;
      position = bounded;
      boundedByLayout = true;
    },
    flushLayoutChange: () => {
      if (!boundedByLayout) return;
      boundedByLayout = false;
      notify();
    },
    move: direction => {
      const next = stepCarousel(position, direction, layout);
      if (next) set(next);
      return next !== null;
    },
    peek: direction => stepCarousel(position, direction, layout)?.focused ?? null,
    page: direction => {
      const leading = clamp(position.leading + direction * layout.perPage, 0, maxLeading(layout));
      set({ focused: leading, leading });
    },
    pointerFocus: index => set({ ...position, focused: index }),
    reveal: index => set(revealItem(position, index, layout)),
  };
}

/**
 * Carousel state for one row: the focused item and the track's position. Keys move both; the
 * pointer moves focus only (never scrolls); `reveal` restores a remembered item. The returned
 * object is stable and holds the position outside React state, so moving re-renders only the
 * components that read the position with `useCarouselPosition` (the Carousel itself), never the
 * component that owns the row.
 */
export function useCarouselNavigation(
  layout: CarouselLayout,
  initialIndex = 0
): CarouselNavigation {
  const [store] = useState(() => createCarouselStore(layout, initialIndex));
  // Applied during render, so this render and its children already read the bounded position;
  // the same layout again changes nothing, so a repeated or discarded render is harmless
  store.setLayout(layout);
  // Readers that didn't render with the new layout hear of the bounded position before paint
  useLayoutEffect(() => store.flushLayoutChange());
  return store;
}

/**
 * Reads a carousel's position and re-renders when what `select` returns changes: return a
 * primitive (an index, a page number), not a new object. Without `navigation` it reads nothing and
 * returns undefined.
 */
export function useCarouselPosition<T>(
  navigation: CarouselNavigation | undefined,
  select: (position: CarouselPosition) => T
): T | undefined {
  return useSyncExternalStore(
    navigation?.subscribe ?? noSubscription,
    () => (navigation ? select(navigation.position()) : undefined),
    () => (navigation ? select(navigation.position()) : undefined)
  );
}

const noSubscription = () => () => undefined;
