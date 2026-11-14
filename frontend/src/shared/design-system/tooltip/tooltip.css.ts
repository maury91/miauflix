import { style } from '@vanilla-extract/css';

import { color, duration, easing, fontFamily, layer, radius, space, typeScale } from '../tokens';

/**
 * Tooltip (docs/plans/style-guide.md, section 8.3 A): dark text on a solid light background with a
 * pointer aimed at the anchor, a visible gap, never interactive. A rail as wide as the anchor sits
 * on its top or bottom edge and centres the bubble with flexbox (an overflowing flex item centres
 * on both sides), so no size is measured and opening causes no layout: the rail fades and slides
 * with opacity and transform only. States are attributes on the anchor:
 *
 * - `data-open`: shown
 * - `data-placement="top" | "bottom"`: side of the anchor
 * - `data-align="center" | "start" | "end"`: the bubble's alignment along the anchor (start/end for
 *   anchors near a screen edge). The pointer always aims at the anchor's centre.
 */

const pointerSize = 0.5;
const pointerHalf = pointerSize / 2;
/** Anchor edge to bubble: room for the pointer plus a visible gap. */
const gap = `${pointerHalf + parseFloat(space['2xs'])}rem`;
const shift = '0.25rem';
const motion = `opacity ${duration.standard} ${easing.standard}, transform ${duration.standard} ${easing.standard}`;

export const anchor = style({
  position: 'relative',
  display: 'inline-flex',
  verticalAlign: 'middle',
});

export const rail = style({
  position: 'absolute',
  zIndex: layer.tooltip,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
  opacity: 0,
  visibility: 'hidden',
  transition: `${motion}, visibility 0s linear ${duration.standard}`,
  selectors: {
    [`${anchor}[data-placement="top"] &`]: {
      bottom: '100%',
      alignItems: 'flex-end',
      paddingBottom: gap,
      transform: `translateY(${shift})`,
    },
    [`${anchor}[data-placement="bottom"] &`]: {
      top: '100%',
      alignItems: 'flex-start',
      paddingTop: gap,
      transform: `translateY(-${shift})`,
    },
    [`${anchor}[data-align="start"] &`]: { justifyContent: 'flex-start' },
    [`${anchor}[data-align="end"] &`]: { justifyContent: 'flex-end' },
    [`${anchor}[data-open] &`]: {
      opacity: 1,
      visibility: 'visible',
      transform: 'translateY(0)',
      transition: `${motion}, visibility 0s`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
      // As specific as the open rule, which sets its own transition
      selectors: { [`${anchor}[data-open] &`]: { transition: 'none' } },
    },
  },
});

export const bubble = style({
  flex: 'none',
  boxSizing: 'border-box',
  width: 'max-content',
  maxWidth: '16rem',
  padding: `${space['2xs']} ${space.xs}`,
  borderRadius: radius.md,
  backgroundColor: color.text,
  color: color.canvas,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  fontWeight: 500,
  textAlign: 'center',
});

/** A rotated square at the anchor's centre, half hidden behind the bubble's edge. */
export const pointer = style({
  position: 'absolute',
  left: '50%',
  width: `${pointerSize}rem`,
  height: `${pointerSize}rem`,
  marginLeft: `-${pointerHalf}rem`,
  backgroundColor: color.text,
  transform: 'rotate(45deg)',
  selectors: {
    [`${anchor}[data-placement="top"] &`]: { bottom: `${parseFloat(gap) - pointerHalf}rem` },
    [`${anchor}[data-placement="bottom"] &`]: { top: `${parseFloat(gap) - pointerHalf}rem` },
  },
});
