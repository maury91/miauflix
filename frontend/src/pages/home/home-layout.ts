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
  windowWidth: number;
  windowHeight: number;
}

/** Card sizes for Home rows, in pixels, for a window size. */
export function mediaBoxSizes({ width, height }: WindowSize): MediaBoxSizes {
  const mediaWidth = CARD_WIDTH_OF_HEIGHT * height;
  const gap = CARD_GAP_OF_HEIGHT * height;
  const sideMargin = ROW_SIDE_MARGIN_OF_WIDTH * width;
  const mediaPerPage = Math.floor((width - gap - sideMargin * 2) / (mediaWidth + gap));
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
  const distance = (index: number) =>
    index < activeCategory ? activeCategory - index : index - (activeCategory + 1);
  const prefetch = Array.from({ length: categoryCount }, (_, index) => index)
    .filter(index => !visible.has(index))
    .sort((left, right) => distance(left) - distance(right) || right - left)
    .slice(0, PREFETCH_ROWS);
  return { visible, prefetch: new Set(prefetch) };
}
