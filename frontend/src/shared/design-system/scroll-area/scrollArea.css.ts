import { style } from '@vanilla-extract/css';

import { focusRing } from '../tokens';

/**
 * ScrollArea (docs/plans/style-guide.md, section 8.1): one element that owns a region's vertical
 * scrolling and reveals the focused element inside it.
 *
 * - `data-mode="scroll"`: native scrolling (wheel, touch, scrollbar), animated reveals (web)
 * - `data-mode="transform"`: the content moves by a compositor transition and nothing scrolls
 *   natively (TV: scrolling lays out every mounted row on every frame)
 */

const rem = (value: string) => parseFloat(value);
/** Room for the focus outline at the content's edges, which the area clips. */
const outlineRoom = `${rem(focusRing.width) + rem(focusRing.offset)}rem`;

export const viewport = style({
  position: 'relative',
  boxSizing: 'border-box',
  height: '100%',
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  // Focus is virtual: the area itself never shows a focus ring
  outline: 'none',
  selectors: {
    '&[data-mode="transform"]': { overflowY: 'hidden' },
  },
});

export const content = style({
  // The offset parent of what it holds, so reveals measure within it
  position: 'relative',
  boxSizing: 'border-box',
  padding: outlineRoom,
  selectors: {
    [`${viewport}[data-mode="transform"] > &`]: { willChange: 'transform' },
  },
});
