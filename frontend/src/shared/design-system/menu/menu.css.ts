import { keyframes, style } from '@vanilla-extract/css';

import {
  color,
  controlSize,
  duration,
  easing,
  fontFamily,
  layer,
  radius,
  shadowOverlay,
  space,
  typeScale,
} from '../tokens';

/**
 * Menu (docs/plans/style-guide.md, sections 4 and 8.4): a raised panel of actions next to its
 * trigger, placed without measuring and animated with opacity and transform only. Items are
 * inverted-fill actions: the active one (the menu's virtual focus) is white.
 *
 * - `data-placement="bottom" | "top"`, `data-align="start" | "end"` on the popup
 * - `data-active` on the active item, `aria-disabled="true"` on a disabled one
 */

export const root = style({
  position: 'relative',
  display: 'inline-flex',
  verticalAlign: 'middle',
});

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(-0.5rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});
const appearAbove = keyframes({
  from: { opacity: 0, transform: 'translateY(0.5rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const popup = style({
  position: 'absolute',
  zIndex: layer.popover,
  boxSizing: 'border-box',
  minWidth: '12rem',
  maxWidth: '20rem',
  padding: space['2xs'],
  borderRadius: radius.lg,
  backgroundColor: color.surfaceRaised,
  boxShadow: shadowOverlay,
  outline: 'none',
  fontFamily,
  selectors: {
    '&[data-placement="bottom"]': {
      top: '100%',
      marginTop: space.xs,
      animation: `${appear} ${duration.panel} ${easing.standard}`,
    },
    '&[data-placement="top"]': {
      bottom: '100%',
      marginBottom: space.xs,
      animation: `${appearAbove} ${duration.panel} ${easing.standard}`,
    },
    '&[data-align="start"]': { left: 0 },
    '&[data-align="end"]': { right: 0 },
    '[dir="rtl"] &[data-align="start"]': { left: 'auto', right: 0 },
    '[dir="rtl"] &[data-align="end"]': { right: 'auto', left: 0 },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const item = style({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  minHeight: controlSize.md.height,
  padding: `${space['2xs']} ${space.md}`,
  borderRadius: radius.md,
  color: color.onAction,
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
  textDecoration: 'none',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  outline: 'none',
  selectors: {
    '&[data-active]': { backgroundColor: color.actionFocus, color: color.onActionFocus },
    '&[aria-disabled="true"]': { color: color.onActionDisabled, cursor: 'default' },
  },
});

export const icon = style({
  display: 'flex',
  flex: 'none',
  width: '1.25rem',
  marginRight: space.sm,
  fontSize: '1.25rem',
  lineHeight: 0,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.sm },
  },
});

export const label = style({
  flex: '1 1 auto',
  minWidth: 0,
  overflowWrap: 'break-word',
});

export const separator = style({
  height: '0.0625rem',
  margin: `${space['2xs']} ${space.xs}`,
  border: 0,
  backgroundColor: color.borderSubtle,
});
