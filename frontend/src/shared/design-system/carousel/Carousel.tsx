import { useComposite, useHasNavigation } from '@shared/navigation/hooks';
import type { MoreRequest } from '@shared/navigation/types';
import {
  memo,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import {
  easeStandard,
  type GlNode,
  GlParentProvider,
  remPx,
  useGlNode,
  useGlPaint,
  useGlParent,
} from '../gl';
import { IconButton } from '../icon-button/IconButton';
import { SurfaceContextProvider } from '../surface';
import { duration, space } from '../tokens';
import { paintCarouselEdges } from './carousel.art';
import * as styles from './carousel.css';
import { type CarouselNavigation, maxLeading, useCarouselPosition } from './carouselNavigation';
import { type CollectionGeometry, itemExtent } from './collectionGeometry';

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
  focusedIndex?: number | null;
  /** The item in the left-most visible slot: the track's position, from `useCarouselNavigation`. */
  leadingIndex?: number;
  /**
   * With `navigation` (what `useCarouselNavigation` returns), registers the row with the navigation
   * layer as one composite of its items: Left/Right step or page through `navigation`, leaving at
   * the ends, and entering lands on the kept item. `focusedIndex` and `leadingIndex` then come from
   * the layer and `navigation`. See NavigableProps.
   */
  navId?: string;
  navigation?: CarouselNavigation;
  /**
   * Items exist past the last one given (a paginated row). With `navId`, Right from the last item
   * waits on `onLoadMore` instead of leaving the row, and moves on once the new items arrive,
   * unless the user went elsewhere meanwhile.
   */
  hasMore?: boolean;
  /**
   * Loads the next page once per waiting move; stop when `request.signal` aborts. A returned
   * promise settling (or failing) lets the next Right ask again.
   */
  onLoadMore?: (request: MoreRequest) => Promise<unknown> | void;
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
  /** What the carousel sits on: the peeking items fade into it. */
  surface?: 'canvas' | 'black';
}

/**
 * A horizontal, focus-aware row on the collection geometry: whole items centred with a peek on
 * each side, moved by translating a track. The row owns no keys: the navigation layer calls
 * `useCarouselNavigation`'s `move` and feeds the result back, so Left/Right, item memory and exits
 * live in one place. Memoized: with a stable `renderItem`, `navigation` and `pageButtons`, the
 * owner re-rendering (a row whose data or load state changed) leaves the carousel alone.
 */
export const Carousel = memo(function Carousel({
  labelledBy,
  label,
  count,
  renderItem,
  geometry,
  itemHeight,
  focusedIndex: focusedIndexProp = null,
  leadingIndex: leadingIndexProp,
  onPointerFocus: onPointerFocusProp,
  pageButtons,
  overscan,
  surface = 'canvas',
  navId,
  navigation,
  hasMore = false,
  onLoadMore,
}: CarouselProps) {
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

  // GL form (inside a GlSurface): the viewport clips, the track slides in the renderer, the edges
  // fade over the peeks. The DOM below keeps only the list and its items, unpositioned.
  const glParent = useGlParent();
  const viewportNode = useGlNode();
  const trackNode = useGlNode(viewportNode);
  const edgesNode = useGlNode(viewportNode);
  const viewportPadding = glParent ? remPx(space.xs) : 0;
  const viewportWidth = contentWidth + peek * 2;
  const viewportHeight = height + viewportPadding * 2;
  const trackPlaced = useRef(false);
  useLayoutEffect(() => {
    if (!glParent || !viewportNode || !trackNode || !edgesNode) return;
    viewportNode.set({
      x: (glParent.width - viewportWidth) / 2,
      width: viewportWidth,
      height: viewportHeight,
      clip: true,
    });
    trackNode.set({ y: viewportPadding });
    edgesNode.set({ z: 2 });
  });
  useLayoutEffect(() => {
    if (!trackNode) return;
    placeTrack(trackNode, leadingIndex, geometry, trackPlaced.current);
    trackPlaced.current = true;
  }, [leadingIndex, geometry, trackNode]);

  const first = Math.max(0, leadingIndex - extra);
  const last = Math.min(count - 1, leadingIndex + perPage - 1 + extra);
  const slots: ReactNode[] = [];
  for (let index = first; index <= last; index++) {
    slots.push(
      <CarouselSlot
        key={index}
        index={index}
        count={count}
        x={itemExtent(index, geometry).start}
        width={itemWidth}
        height={height}
        focused={index === focusedIndex}
        renderItem={renderItem}
        onPointer={handlePointer}
        glTrack={trackNode}
      />
    );
  }

  const canGoBack = leadingIndex > 0;
  const canGoForward = leadingIndex < maxLeading({ count, perPage });
  useGlPaint(
    edgesNode,
    painter =>
      paintCarouselEdges(painter, {
        peek,
        width: viewportWidth,
        height: viewportHeight,
        surface,
        canGoBack,
        canGoForward,
      }),
    [peek, surface, canGoBack, canGoForward, viewportWidth, viewportHeight]
  );
  if (glParent) {
    return (
      <section
        ref={composite.ref}
        className={styles.glRoot}
        aria-roledescription="carousel"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
      >
        <ul className={styles.glList}>{slots}</ul>
      </section>
    );
  }
  return (
    <section
      ref={composite.ref}
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
          <span
            className={styles.edge}
            data-side="start"
            data-surface={surface}
            style={{ width: peek }}
          />
        )}
        {canGoForward && peek > 0 && (
          <span
            className={styles.edge}
            data-side="end"
            data-surface={surface}
            style={{ width: peek }}
          />
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
});

interface CarouselSlotProps {
  index: number;
  count: number;
  x: number;
  width: number;
  height: number;
  focused: boolean;
  renderItem: CarouselProps['renderItem'];
  onPointer: (index: number, event: MouseEvent) => void;
  /** The GL track the slot's node joins (inside a GlSurface). */
  glTrack: GlNode | null;
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
  glTrack,
}: CarouselSlotProps) {
  const glParent = useGlParent();
  const node = useGlNode(glTrack);
  useLayoutEffect(() => {
    node?.set({ x, width, height, z: focused ? 1 : 0 });
  });
  const glValue = useMemo(
    () =>
      glParent && node ? { renderer: glParent.renderer, node, width, height, radius: 0 } : null,
    [glParent, height, node, width]
  );
  if (glValue) {
    return (
      <li
        className={styles.glSlot}
        aria-setsize={count}
        aria-posinset={index + 1}
        data-focused={focused || undefined}
        data-nav-part={index}
        onMouseMove={event => onPointer(index, event)}
      >
        <GlParentProvider value={glValue}>{renderItem(index, { focused })}</GlParentProvider>
      </li>
    );
  }
  return (
    <li
      className={styles.slot}
      aria-setsize={count}
      aria-posinset={index + 1}
      data-focused={focused || undefined}
      // The composite part: DOM focus mirrors onto the item inside it
      data-nav-part={index}
      style={{ width, height, transform: `translateX(${x}px)` }}
      onMouseMove={event => onPointer(index, event)}
    >
      {renderItem(index, { focused })}
    </li>
  );
});

/**
 * GL: moves the track so `leadingIndex` is the left-most whole item (at once the first time). The
 * track's X is the only thing that moves when the carousel pages.
 */
function placeTrack(
  track: GlNode,
  leadingIndex: number,
  { itemWidth, gap }: CollectionGeometry,
  animate: boolean
) {
  const x = -leadingIndex * (itemWidth + gap);
  if (animate) track.animate('x', x, parseFloat(duration.fast), easeStandard);
  else track.set({ x });
}
