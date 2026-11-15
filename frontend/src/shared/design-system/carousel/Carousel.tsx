import {
  memo,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { IconButton } from '../icon-button/IconButton';
import { SurfaceContextProvider } from '../surface';
import { duration } from '../tokens';
import * as styles from './carousel.css';
import { maxLeading } from './carouselNavigation';
import type { CollectionGeometry } from './collectionGeometry';

import ChevronLeftIcon from '~icons/mdi/chevron-left';
import ChevronRightIcon from '~icons/mdi/chevron-right';

/** How long after the track starts moving the pointer is locked: the translate plus a frame. */
const POINTER_LOCK_MS = parseFloat(duration.fast) + 30;

export interface CarouselItemState {
  /** Virtual focus: pass it to the tile. */
  focused: boolean;
}

export interface CarouselProps {
  /** The carousel's accessible name: the row title's id… */
  labelledBy?: string;
  /** …or a name when there is no visible title. */
  label?: string;
  /** How many items the row has; only those near the visible ones are mounted. */
  count: number;
  /**
   * Renders one item, usually a CollectionTile. Keep it stable (`useCallback` over the data), so a
   * focus move re-renders only the two items whose focus changed.
   */
  renderItem: (index: number, state: CarouselItemState) => ReactNode;
  /** Sizes from `collectionGeometry` for the current window. */
  geometry: CollectionGeometry;
  /** Item height (px); a 16:9 frame of the item width by default. */
  itemHeight?: number;
  /** The focused item, or `null` while focus is outside the row (it keeps its position). */
  focusedIndex: number | null;
  /** The item in the left-most visible slot: the track's position, from `useCarouselNavigation`. */
  leadingIndex: number;
  /**
   * The pointer moved onto an item: focus it without scrolling. Ignored while a scroll animates
   * and for synthetic events after it (content that stopped under a resting pointer).
   */
  onPointerFocus?: (index: number) => void;
  /** Previous/next page buttons for the pointer (web). Labels from the feature (i18n). */
  pageButtons?: {
    previousLabel: string;
    nextLabel: string;
    onPage: (direction: -1 | 1) => void;
  };
  /** Items mounted beyond each edge of the visible ones; a page by default. */
  overscan?: number;
}

/**
 * A horizontal, focus-aware row on the collection geometry: whole items centred with a peek on
 * each side, moved by translating a track. The row owns no keys: the navigation layer calls
 * `useCarouselNavigation`'s `move` and feeds the result back, so Left/Right, item memory and exits
 * live in one place.
 */
export function Carousel({
  labelledBy,
  label,
  count,
  renderItem,
  geometry,
  itemHeight,
  focusedIndex,
  leadingIndex,
  onPointerFocus,
  pageButtons,
  overscan,
}: CarouselProps) {
  const { itemWidth, gap, perPage, peek, contentWidth } = geometry;
  const step = itemWidth + gap;
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
    state.timer = window.setTimeout(() => {
      state.locked = false;
    }, POINTER_LOCK_MS);
  }, [leadingIndex]);
  useEffect(() => () => window.clearTimeout(pointer.current.timer), []);

  const onPointerFocusRef = useRef(onPointerFocus);
  onPointerFocusRef.current = onPointerFocus;
  const handlePointer = useCallback((index: number, event: MouseEvent) => {
    const state = pointer.current;
    const moved = event.clientX !== state.x || event.clientY !== state.y;
    state.x = event.clientX;
    state.y = event.clientY;
    if (state.locked || !moved) return;
    onPointerFocusRef.current?.(index);
  }, []);

  const first = Math.max(0, leadingIndex - extra);
  const last = Math.min(count - 1, leadingIndex + perPage - 1 + extra);
  const slots: ReactNode[] = [];
  for (let index = first; index <= last; index++) {
    slots.push(
      <CarouselSlot
        key={index}
        index={index}
        count={count}
        x={peek + index * step}
        width={itemWidth}
        height={height}
        focused={index === focusedIndex}
        renderItem={renderItem}
        onPointer={handlePointer}
      />
    );
  }

  const canGoBack = leadingIndex > 0;
  const canGoForward = leadingIndex < maxLeading({ count, perPage });
  return (
    <section
      className={styles.root}
      aria-roledescription="carousel"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      <div className={styles.viewport} style={{ width: contentWidth + peek * 2, height }}>
        <ul className={styles.track} style={{ transform: `translateX(${-leadingIndex * step}px)` }}>
          {slots}
        </ul>
        {canGoBack && peek > 0 && (
          <span className={styles.edge} data-side="start" style={{ width: peek }} />
        )}
        {canGoForward && peek > 0 && (
          <span className={styles.edge} data-side="end" style={{ width: peek }} />
        )}
        {pageButtons && (
          <SurfaceContextProvider value="overMedia">
            {canGoBack && (
              <span className={styles.pageButton} data-side="start">
                <IconButton
                  label={pageButtons.previousLabel}
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  tabIndex={-1}
                  onClick={() => pageButtons.onPage(-1)}
                />
              </span>
            )}
            {canGoForward && (
              <span className={styles.pageButton} data-side="end">
                <IconButton
                  label={pageButtons.nextLabel}
                  icon={<ChevronRightIcon />}
                  size="sm"
                  tabIndex={-1}
                  onClick={() => pageButtons.onPage(1)}
                />
              </span>
            )}
          </SurfaceContextProvider>
        )}
      </div>
    </section>
  );
}

interface CarouselSlotProps {
  index: number;
  count: number;
  x: number;
  width: number;
  height: number;
  focused: boolean;
  renderItem: CarouselProps['renderItem'];
  onPointer: (index: number, event: MouseEvent) => void;
}

/** One positioned item. Memoized: a focus move re-renders only the slots whose focus changed. */
const CarouselSlot = memo(function CarouselSlot({
  index,
  count,
  x,
  width,
  height,
  focused,
  renderItem,
  onPointer,
}: CarouselSlotProps) {
  return (
    <li
      className={styles.slot}
      aria-setsize={count}
      aria-posinset={index + 1}
      data-focused={focused || undefined}
      style={{ width, height, transform: `translateX(${x}px)` }}
      onMouseMove={event => onPointer(index, event)}
    >
      {renderItem(index, { focused })}
    </li>
  );
});
