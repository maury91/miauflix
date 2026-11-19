/**
 * The collection geometry contract (docs/plans/style-guide.md, "Collection geometry and tile
 * focus"): the tuned Home row sizes, in pixels from the window size. It is the documented exception
 * to the rem rule. Home's rows (`pages/home/home-layout.ts`, `mediaBoxSizes`) are built on it.
 */

/** Card width as a share of the window height (16:9 cards, 35.2vh wide). */
export const ITEM_WIDTH_OF_HEIGHT = 0.352;
/** Gap between cards as a share of the window height (2vh). */
export const ITEM_GAP_OF_HEIGHT = 0.02;
/** Minimum space on each side of a row as a share of the window width (5vw). */
export const SIDE_MARGIN_OF_WIDTH = 0.05;
/** At most half a card peeks in from either side. */
export const MAX_PEEK_OF_ITEM = 0.5;

export interface CollectionGeometry {
  /** One item's width (px). */
  itemWidth: number;
  /** Space between items (px). */
  gap: number;
  /** Whole items between the side margins. */
  perPage: number;
  /** Width of the partial item shown at each edge (px). */
  peek: number;
  /** Width of the whole items and the gaps between them (px). */
  contentWidth: number;
}

/** Sizes for one row of items in a window of `width` × `height` pixels. */
export function collectionGeometry({
  width,
  height,
}: {
  width: number;
  height: number;
}): CollectionGeometry {
  const itemWidth = ITEM_WIDTH_OF_HEIGHT * height;
  const gap = ITEM_GAP_OF_HEIGHT * height;
  const sideMargin = SIDE_MARGIN_OF_WIDTH * width;
  const fitting = Math.floor((width - gap - sideMargin * 2) / (itemWidth + gap));
  // At least one item, also before the window is measured (a zero height divides by zero)
  const perPage = Number.isFinite(fitting) ? Math.max(1, fitting) : 1;
  const contentWidth = itemWidth * perPage + gap * (perPage - 1);
  const margin = (width - contentWidth) / 2;
  const peek = Math.min(itemWidth * MAX_PEEK_OF_ITEM, Math.max(0, margin));
  return { itemWidth, gap, perPage, peek, contentWidth };
}

/** Where item `index` sits on the track's X axis (px): after the peek, one item and gap apart. */
export function itemExtent(index: number, { itemWidth, gap, peek }: CollectionGeometry) {
  const start = peek + index * (itemWidth + gap);
  return { start, end: start + itemWidth };
}
