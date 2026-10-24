import { createSelector } from '@reduxjs/toolkit';
import { selectWindowSize, type WindowSize } from '@store/slices/measurements';

/** Card width as a share of the window height (16:9 cards, 35.2vh wide). */
export const CARD_WIDTH_OF_HEIGHT = 0.352;
/** Gap between cards as a share of the window height (2vh). */
export const CARD_GAP_OF_HEIGHT = 0.02;
/** Minimum space kept on each side of a row as a share of the window width (5vw). */
export const ROW_SIDE_MARGIN_OF_WIDTH = 0.05;
/** At most half a card peeks in from either side of a row. */
export const MAX_PEEK_OF_CARD = 0.5;
/**
 * Every row is exactly this tall (vh), space below included: title 6vh, cards 22vh, gap 5vh.
 * A fixed height lets Home place and scroll to any row without measuring it.
 */
export const ROW_HEIGHT_VH = 33;
export const ROW_GAP_VH = 5;

export interface MediaBoxSizes {
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

/** Card sizes for Home rows, in pixels, for a window size. */
export function mediaBoxSizes({ width, height }: WindowSize): MediaBoxSizes {
  const mediaWidth = CARD_WIDTH_OF_HEIGHT * height;
  const gap = CARD_GAP_OF_HEIGHT * height;
  const sideMargin = ROW_SIDE_MARGIN_OF_WIDTH * width;
  const fitting = Math.floor((width - gap - sideMargin * 2) / (mediaWidth + gap));
  // At least one card, also before the window is measured (a zero height divides by zero).
  const mediaPerPage = Number.isFinite(fitting) ? Math.max(1, fitting) : 1;
  const totalMediaWidth = mediaWidth * mediaPerPage + gap * (mediaPerPage - 1);
  const margin = (width - totalMediaWidth) / 2;
  const peekWidth = Math.min(mediaWidth * MAX_PEEK_OF_CARD, Math.max(0, margin));
  return {
    mediaWidth,
    mediaPerPage,
    gap,
    margin,
    peekWidth,
    width: totalMediaWidth,
    rowHeight: (ROW_HEIGHT_VH / 100) * height,
    windowWidth: width,
    windowHeight: height,
  };
}

export const selectMediaBoxSizes = createSelector([selectWindowSize], mediaBoxSizes);

/** Rows, beyond the visible ones, whose first page is fetched ahead of navigation. */
export const PREFETCH_ROWS = 4;

export interface RowLoadState {
  /** The focused row and the one below it: on screen, fully loaded and promoted. */
  visible: Set<number>;
  /** The nearest other rows, fetched at prefetch priority. */
  prefetch: Set<number>;
}

/**
 * Which Home rows load, from the focused row. The nearest rows are prefetched, the row below
 * before the row above at the same distance; every other row stays dormant.
 */
export function homeRowLoadState(activeCategory: number, categoryCount: number): RowLoadState {
  const inRange = (index: number) => index >= 0 && index < categoryCount;
  const visible = new Set([activeCategory, activeCategory + 1].filter(inRange));
  const prefetch = new Set<number>();
  for (let distance = 1; prefetch.size < PREFETCH_ROWS && distance <= categoryCount; distance++) {
    for (const index of [activeCategory + 1 + distance, activeCategory - distance]) {
      if (inRange(index) && prefetch.size < PREFETCH_ROWS) prefetch.add(index);
    }
  }
  return { visible, prefetch };
}

/** Rows kept mounted above and below the shown ones; further rows are empty space. */
const MOUNTED_ROWS_ABOVE = PREFETCH_ROWS;
const MOUNTED_ROWS_BELOW = 4;

/**
 * The rows Home mounts, ascending: those around the focused row and those around the rows
 * scrolled into view, covering every row `homeRowLoadState` loads. Every other row is empty space.
 */
export function homeMountedRows(
  activeCategory: number,
  firstShownRow: number,
  categoryCount: number
) {
  const rows = new Set<number>();
  for (const anchor of [activeCategory, firstShownRow]) {
    const end = Math.min(categoryCount - 1, anchor + 1 + MOUNTED_ROWS_BELOW);
    for (let row = Math.max(0, anchor - MOUNTED_ROWS_ABOVE); row <= end; row++) rows.add(row);
  }
  return [...rows].sort((left, right) => left - right);
}
