import { globalStyle, style } from '@vanilla-extract/css';

import {
  color,
  duration,
  easing,
  focusRing,
  fontFamily,
  radius,
  space,
  typeScale,
} from '../tokens';

/**
 * Disclosure (docs/plans/style-guide.md, sections 4 and 8.2): a section header that shows or hides
 * its content. The header is a row, which cannot invert, so virtual focus is the white outline
 * around it (a pseudo-element following the radius, toggled by opacity). Attributes on the
 * trigger:
 *
 * - `data-focused`: virtual focus
 * - `aria-expanded`: turns the chevron (a transform only)
 */

const rem = (value: string) => parseFloat(value);
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
const outlineInset = `-${outlineDistance}rem`;

export const disclosure = style({
  minWidth: 0,
  color: color.text,
  fontFamily,
});

/** The trigger and the optional actions beside it (siblings, never nested in the button). */
export const header = style({
  display: 'flex',
  alignItems: 'center',
});

export const heading = style({
  flex: '1 1 auto',
  minWidth: 0,
  margin: 0,
  // The app's global heading rule uppercases and lightens h1–h6
  fontStyle: 'normal',
  fontWeight: 'inherit',
  textTransform: 'none',
});

export const trigger = style({
  position: 'relative',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: '3rem',
  margin: 0,
  border: 0,
  borderRadius: radius.md,
  padding: `${space.xs} ${space.sm}`,
  backgroundColor: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  // Focus is virtual and shown by the outline
  outline: 'none',
  selectors: {
    '[dir="rtl"] &': { textAlign: 'right' },
    '&:disabled': { cursor: 'default', color: color.textDisabled },
    '&::after': {
      content: '""',
      position: 'absolute',
      top: outlineInset,
      right: outlineInset,
      bottom: outlineInset,
      left: outlineInset,
      border: `${focusRing.width} solid ${color.focusOutline}`,
      borderRadius: `${rem(radius.md) + outlineDistance}rem`,
      opacity: 0,
      pointerEvents: 'none',
    },
    '&[data-focused]::after': { opacity: 1 },
  },
});

export const chevron = style({
  display: 'flex',
  flex: 'none',
  width: '1.5rem',
  height: '1.5rem',
  marginRight: space.sm,
  transform: 'rotate(-90deg)',
  transition: `transform ${duration.standard} ${easing.standard}`,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.sm, transform: 'rotate(90deg)' },
    '[aria-expanded="true"] > &': { transform: 'rotate(0deg)' },
    '[dir="rtl"] [aria-expanded="true"] > &': { transform: 'rotate(0deg)' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

globalStyle(`${chevron} > svg`, { width: '100%', height: '100%' });

export const text = style({
  display: 'block',
  flex: '1 1 auto',
  minWidth: 0,
});

export const title = style({
  display: 'block',
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
});

export const description = style({
  display: 'block',
  marginTop: space['2xs'],
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  fontWeight: typeScale.caption.fontWeight,
});

export const actions = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  marginLeft: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.sm },
  },
});

/** The content lines up with the title, past the chevron. */
export const panel = style({
  paddingTop: space.sm,
  paddingLeft: `calc(${space.sm} + 1.5rem + ${space.sm})`,
  paddingBottom: space.sm,
  selectors: {
    '[dir="rtl"] &': { paddingLeft: 0, paddingRight: `calc(${space.sm} + 1.5rem + ${space.sm})` },
  },
});
