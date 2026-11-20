import type { MoreRequest } from '@shared/navigation/types';
import { memo, type ReactNode } from 'react';

import { useRenderMode } from '../gl';
import { CarouselDom } from './CarouselDom';
import { CarouselGl } from './CarouselGl';
import type { CarouselNavigation } from './carouselNavigation';
import type { CollectionGeometry } from './collectionGeometry';

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
  /**
   * Previous/next page buttons for the pointer (web). Labels from the feature (i18n). DOM only:
   * inside a GlSurface (the TV, where rows pass none) they aren't drawn.
   */
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
 * owner re-rendering (a row whose data or load state changed) leaves the carousel alone. Drawn by
 * the GlSurface it's in (CarouselGl), or as DOM (CarouselDom).
 */
export const Carousel = memo(function Carousel(props: CarouselProps) {
  return useRenderMode() === 'gl' ? <CarouselGl {...props} /> : <CarouselDom {...props} />;
});
