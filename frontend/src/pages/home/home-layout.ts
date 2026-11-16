import { createSelector } from '@reduxjs/toolkit';
import {
  type CollectionGeometry,
  collectionGeometry,
} from '@shared/design-system/carousel/collectionGeometry';
import { selectWindowSize, type WindowSize } from '@store/slices/measurements';

/**
 * Every row is exactly this tall (vh), space below included: title 6vh, cards 22vh, gap 5vh.
 * A fixed height lets Home place and scroll to any row without measuring it.
 */
export const ROW_HEIGHT_VH = 33;
export const ROW_GAP_VH = 5;

export interface MediaBoxSizes {
  /** The same sizes for a Carousel. */
  geometry: CollectionGeometry;
  mediaWidth: number;
  /** Whole cards that fit in a row between the side margins. */
  mediaPerPage: number;
  gap: number;
  /** Space on each side that centres the whole cards. */
  margin: number;
  /** Width of the partial card shown at each edge. */
  peekWidth: number;
  /** Width of the whole cards and the gaps between them. */
  width: number;
  /** Height of one row, the space below it included. */
  rowHeight: number;
  windowWidth: number;
  windowHeight: number;
}

/** Card sizes for Home rows, in pixels, for a window size: the design system's collection geometry. */
export function mediaBoxSizes({ width, height }: WindowSize): MediaBoxSizes {
  const geometry = collectionGeometry({ width, height });
  return {
    geometry,
    mediaWidth: geometry.itemWidth,
    mediaPerPage: geometry.perPage,
    gap: geometry.gap,
    margin: (width - geometry.contentWidth) / 2,
    peekWidth: geometry.peek,
    width: geometry.contentWidth,
    rowHeight: (ROW_HEIGHT_VH / 100) * height,
    windowWidth: width,
    windowHeight: height,
  };
}

export const selectMediaBoxSizes = createSelector([selectWindowSize], mediaBoxSizes);

/** Rows, beyond the visible ones, whose first page is fetched ahead of navigation. */
export const PREFETCH_ROWS = 4;

/** Rows below the visible ones that Home readies while the user is idle (see useIdleRowWarmup). */
export const WARM_ROWS = 10;

export interface RowLoadState {
  /** The rows on screen (the focused row, the first row in view, and the one below each): fully
   * loaded and promoted. */
  visible: Set<number>;
  /** The nearest other rows, fetched at prefetch priority. */
  prefetch: Set<number>;
  /**
   * The rows below the visible ones up to `warmUntil` (at most WARM_ROWS of them): fetched at
   * prefetch priority, mounted and rendered in full off screen, so moving down finds them ready.
   * Not promoted to the backend.
   */
  warm: Set<number>;
}

/**
 * Which Home rows load, from the focused row and, when the content was scrolled away from it (a
 * mouse wheel or touch scroll), from the first row in view. The rows on screen are visible; the
 * nearest rows are prefetched, the row below before the row above at the same distance; every
 * other row stays dormant.
 */
export function homeRowLoadState(
  activeCategory: number,
  categoryCount: number,
  warmUntil = -1,
  shownRow = activeCategory
): RowLoadState {
  const inRange = (index: number) => index >= 0 && index < categoryCount;
  const anchors = shownRow === activeCategory ? [activeCategory] : [activeCategory, shownRow];
  const visible = new Set(anchors.flatMap(anchor => [anchor, anchor + 1]).filter(inRange));
  const prefetch = new Set<number>();
  for (const anchor of anchors) {
    let added = 0;
    for (let distance = 1; added < PREFETCH_ROWS && distance <= categoryCount; distance++) {
      for (const index of [anchor + 1 + distance, anchor - distance]) {
        if (inRange(index) && added < PREFETCH_ROWS && !visible.has(index)) {
          if (!prefetch.has(index)) prefetch.add(index);
          added++;
        }
      }
    }
  }
  const warm = new Set<number>();
  const lastWarm = Math.min(warmUntil, activeCategory + 1 + WARM_ROWS);
  for (let index = activeCategory + 2; index <= lastWarm; index++) {
    if (inRange(index) && !visible.has(index)) warm.add(index);
  }
  return { visible, prefetch, warm };
}

/** Rows kept mounted above and below the shown ones; further rows are empty space. */
const MOUNTED_ROWS_ABOVE = PREFETCH_ROWS;
const MOUNTED_ROWS_BELOW = 4;

/**
 * The rows Home mounts, ascending: those around the focused row and those around the rows
 * scrolled into view, covering every row `homeRowLoadState` loads (`warmUntil` as there). Every
 * other row is empty space.
 */
export function homeMountedRows(
  activeCategory: number,
  firstShownRow: number,
  categoryCount: number,
  warmUntil = -1
) {
  const rows = new Set<number>();
  const lastWarm = Math.min(warmUntil, activeCategory + 1 + WARM_ROWS);
  for (const anchor of [activeCategory, firstShownRow]) {
    const end = Math.min(categoryCount - 1, Math.max(anchor + 1 + MOUNTED_ROWS_BELOW, lastWarm));
    for (let row = Math.max(0, anchor - MOUNTED_ROWS_ABOVE); row <= end; row++) rows.add(row);
  }
  return [...rows].sort((left, right) => left - right);
}
