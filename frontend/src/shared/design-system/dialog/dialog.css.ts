import { globalStyle, keyframes, style } from '@vanilla-extract/css';

import {
  color,
  duration,
  easing,
  fontFamily,
  layer,
  radius,
  scrim,
  shadowOverlay,
  space,
  tvSafeArea,
  typeScale,
} from '../tokens';

/**
 * Dialog (docs/plans/style-guide.md, section 8.5). A fixed backdrop with the modal scrim centres
 * the panel with flexbox; the panel is a raised surface with the one allowed overlay shadow. Only
 * the body scrolls, so the title and actions stay visible. Entering fades the scrim and fades and
 * lifts the panel with opacity and transform only.
 */

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(1rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const backdrop = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: layer.modalBackdrop,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space.lg,
  backgroundColor: scrim.modal,
  animation: `${fadeIn} ${duration.panel} ${easing.standard}`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

// TV keeps the panel inside the safe area
globalStyle(`html[data-density="tv"] ${backdrop}`, {
  padding: `${tvSafeArea.y} ${tvSafeArea.x}`,
});

export const panel = style({
  position: 'relative',
  zIndex: layer.modal,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  maxHeight: '100%',
  borderRadius: radius.lg,
  backgroundColor: color.surfaceRaised,
  boxShadow: shadowOverlay,
  color: color.text,
  fontFamily,
  outline: 'none',
  animation: `${rise} ${duration.panel} ${easing.standard}`,
  selectors: {
    '&[data-size="sm"]': { maxWidth: '26rem' },
    '&[data-size="md"]': { maxWidth: '36rem' },
    '&[data-size="lg"]': { maxWidth: '48rem' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const header = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'flex-start',
  padding: `${space.lg} ${space.lg} 0`,
});

export const title = style({
  flex: '1 1 auto',
  minWidth: 0,
  margin: 0,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
  // The app's global heading rule uppercases and lightens h1–h6
  fontStyle: 'normal',
  textTransform: 'none',
  overflowWrap: 'break-word',
});

/** The close action sits in the corner, pulled into the header's padding. */
export const close = style({
  flex: 'none',
  margin: `-${space.xs} -${space.xs} 0 ${space.md}`,
  selectors: {
    '[dir="rtl"] &': { margin: `-${space.xs} ${space.md} 0 -${space.xs}` },
  },
});

/** Description and content: the only part that scrolls. */
export const body = style({
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  // Room for focus outlines of fields at the edges
  padding: `${space.sm} ${space.lg}`,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
});

export const description = style({
  margin: `0 0 ${space.md}`,
  color: color.textSecondary,
  selectors: {
    '&:last-child': { marginBottom: 0 },
  },
});

/** The actions' room in the panel; ActionGroup lays them out, primary first. */
export const actions = style({
  flex: 'none',
  padding: `${space.sm} ${space.lg} ${space.lg}`,
});
