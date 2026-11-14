import { style } from '@vanilla-extract/css';

import { color, duration, easing, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * Progress (docs/plans/style-guide.md, section 8.5): an indeterminate spinner (the animated
 * `line-md` icon, in the current text color) and a determinate bar. The bar's fill is the brand
 * color, one of the few places it appears, and grows by `transform: scaleX()` from an inline
 * value, so updates only composite.
 */

export const spinner = style({
  display: 'inline-flex',
  alignItems: 'center',
  verticalAlign: 'middle',
  lineHeight: 0,
  selectors: {
    '&[data-size="sm"]': { fontSize: '1.5rem' },
    '&[data-size="md"]': { fontSize: '2rem' },
    '&[data-size="lg"]': { fontSize: '3rem' },
    // `inherit`: 1em of the surrounding text, as in a button's icon slot
  },
});

export const spinnerWithLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  color: color.textSecondary,
  fontFamily,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
});

export const spinnerLabel = style({
  marginLeft: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.sm },
  },
});

export const bar = style({
  display: 'block',
  width: '100%',
  fontFamily,
});

export const barHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: space.xs,
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
});

export const barValue = style({
  marginLeft: space.md,
  color: color.text,
  whiteSpace: 'nowrap',
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.md },
  },
});

export const track = style({
  position: 'relative',
  height: '0.25rem',
  overflow: 'hidden',
  borderRadius: radius.full,
  backgroundColor: color.borderSubtle,
  selectors: {
    '&[data-size="lg"]': { height: '0.5rem' },
  },
});

export const fill = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: color.brand,
  transformOrigin: 'left center',
  transition: `transform ${duration.standard} ${easing.standard}`,
  selectors: {
    '[dir="rtl"] &': { left: 'auto', right: 0, transformOrigin: 'right center' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
