import { keyframes, style } from '@vanilla-extract/css';

import { color, duration, easing, fontFamily, space, typeScale } from '../tokens';

/**
 * IconButtonGroup (docs/plans/style-guide.md, section 8.3 B): a row (or column) of IconButtons with
 * one shared description slot at a fixed place. The slot's height is reserved for one line, so the
 * text changing (or a longer translation) never moves the buttons.
 */

export const group = style({
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  selectors: {
    '&[data-description="above"]': { flexDirection: 'column-reverse' },
  },
});

export const buttons = style({
  display: 'flex',
  alignItems: 'center',
  selectors: {
    '&[data-orientation="vertical"]': { flexDirection: 'column' },
  },
});

export const item = style({
  display: 'flex',
  selectors: {
    [`${buttons}[data-orientation="horizontal"] &:not(:last-child)`]: { marginRight: space.sm },
    [`[dir="rtl"] ${buttons}[data-orientation="horizontal"] &:not(:last-child)`]: {
      marginRight: 0,
      marginLeft: space.sm,
    },
    [`${buttons}[data-orientation="vertical"] &:not(:last-child)`]: { marginBottom: space.sm },
  },
});

const captionHeight = `${parseFloat(typeScale.caption.fontSize) * parseFloat(typeScale.caption.lineHeight)}rem`;

/**
 * Centred under (or over) the buttons. A flex container centres an overflowing child on both
 * sides, so a description wider than the group runs past both ends without widening it.
 */
export const slot = style({
  alignSelf: 'stretch',
  display: 'flex',
  justifyContent: 'center',
  height: captionHeight,
  margin: `${space.xs} 0`,
  color: color.text,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  fontWeight: 500,
  // One line: a longer translation runs past the ends instead of pushing the buttons
  whiteSpace: 'nowrap',
  textAlign: 'center',
});

const appear = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

/** Remounted per focused child, so each new description fades in. */
export const slotText = style({
  flex: 'none',
  display: 'block',
  animation: `${appear} ${duration.standard} ${easing.standard}`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});
