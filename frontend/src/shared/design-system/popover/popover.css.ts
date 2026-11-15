import { keyframes, style } from '@vanilla-extract/css';

import {
  color,
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
 * Popover (docs/plans/style-guide.md, section 8.5): a raised interactive panel next to its trigger,
 * placed without measuring (like Menu) and animated with opacity and transform only. It carries
 * the one overlay shadow, so it reads over artwork too.
 *
 * - `data-placement="bottom" | "top"`, `data-align="start" | "end"`
 * - `data-size="sm" | "md" | "lg"`: 16, 22 or 30rem wide (fixed, so content never resizes it)
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

export const panel = style({
  position: 'absolute',
  zIndex: layer.popover,
  boxSizing: 'border-box',
  maxWidth: 'calc(100vw - 2rem)',
  padding: space.md,
  borderRadius: radius.lg,
  backgroundColor: color.surfaceRaised,
  boxShadow: shadowOverlay,
  color: color.text,
  outline: 'none',
  fontFamily,
  textAlign: 'start',
  whiteSpace: 'normal',
  selectors: {
    '&[data-size="sm"]': { width: '16rem' },
    '&[data-size="md"]': { width: '22rem' },
    '&[data-size="lg"]': { width: '30rem' },
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

export const title = style({
  margin: 0,
  marginBottom: space.sm,
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: 600,
  // The app's global heading rule uppercases and lightens h1–h6
  fontStyle: 'normal',
  textTransform: 'none',
});
