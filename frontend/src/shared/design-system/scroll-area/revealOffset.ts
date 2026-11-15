export interface RevealGeometry {
  /** The current scroll offset (or translation). */
  current: number;
  /** The visible height of the scroll area. */
  viewport: number;
  /** The full height of its content. */
  content: number;
  /** The item's top within the content, and its height. */
  itemTop: number;
  itemHeight: number;
  /** Heights covered by sticky chrome at the top and bottom of the area. */
  startInset?: number;
  endInset?: number;
  /** Room kept between a revealed item and the visible edges (its outline, some context). */
  margin?: number;
}

/**
 * The scroll offset that brings an item fully into view, moving as little as possible: unchanged
 * when it is already visible, its top under the top edge when it is above (or taller than the
 * view), its bottom over the bottom edge when it is below. Clamped to the scrollable range.
 */
export function revealOffset({
  current,
  viewport,
  content,
  itemTop,
  itemHeight,
  startInset = 0,
  endInset = 0,
  margin = 0,
}: RevealGeometry): number {
  const max = Math.max(0, content - viewport);
  const visibleTop = current + startInset + margin;
  const visibleBottom = current + viewport - endInset - margin;
  const itemBottom = itemTop + itemHeight;
  const tooTall = itemHeight > visibleBottom - visibleTop;
  let next = current;
  if (itemTop < visibleTop || tooTall) next = itemTop - startInset - margin;
  else if (itemBottom > visibleBottom) next = itemBottom - viewport + endInset + margin;
  return Math.min(max, Math.max(0, next));
}
