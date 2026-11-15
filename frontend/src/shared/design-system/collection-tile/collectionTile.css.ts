import { globalStyle, style } from '@vanilla-extract/css';

import { color, focusRing, fontFamily, radius, scrim, space, typeScale } from '../tokens';

/**
 * CollectionTile (docs/plans/style-guide.md, sections 5 and 8.4): one primary action led by its
 * artwork. Tiles cannot invert, so virtual focus is the white outline around the frame plus the
 * tuned focus scale (1.03, 150 ms ease-out), both on `transform`/`opacity` only. The tile fills the
 * width its collection gives it (the geometry contract lives with the collection); the frame's
 * height follows from its ratio through padding, which needs no `aspect-ratio` on Chromium 69.
 * States are attributes on the tile:
 *
 * - `data-focused`: outline and scale
 * - `data-ratio="landscape" | "portrait" | "square"`: 16:9, 2:3, 1:1
 * - `data-label="below" | "overlay"`: text under the frame, or over it on the tile scrim
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const rem = (value: string) => parseFloat(value);
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
const outlineInset = `-${outlineDistance}rem`;
const focusMotion = '150ms cubic-bezier(0, 0, 0.2, 1)';

export const tile = style({
  position: 'relative',
  boxSizing: 'border-box',
  display: 'block',
  width: '100%',
  margin: 0,
  border: 0,
  padding: 0,
  backgroundColor: 'transparent',
  color: color.text,
  fontFamily,
  textAlign: 'inherit',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  // Focus is virtual and shown by the outline
  outline: 'none',
  transform: 'scale(1)',
  transition: `transform ${focusMotion}`,
  selectors: {
    '&[data-focused]:not(:disabled)': { zIndex: 1, transform: 'scale(1.03)' },
    '&:disabled': { cursor: 'default' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

/** The artwork frame: a fixed ratio, a placeholder fill while artwork loads or when it is missing. */
export const frame = style({
  position: 'relative',
  display: 'block',
  height: 0,
  borderRadius: radius.md,
  backgroundColor: color.surfaceRaised,
  selectors: {
    [`${tile}[data-ratio="landscape"] &`]: { paddingTop: '56.25%' },
    [`${tile}[data-ratio="portrait"] &`]: { paddingTop: '150%' },
    [`${tile}[data-ratio="square"] &`]: { paddingTop: '100%' },
    [`${tile}:disabled &`]: { opacity: 0.4 },
    // The focus outline: a pseudo-element following the radius, toggled by opacity
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
    [`${tile}[data-focused]:not(:disabled) &::after`]: { opacity: 1 },
  },
});

/** Clips the visual to the frame's radius; the outline stays outside it. */
export const visual = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  overflow: 'hidden',
  borderRadius: 'inherit',
});

/** Images and avatars cover the frame. */
globalStyle(`${visual} > img`, {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const scrimLayer = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  background: scrim.tile,
});

export const badge = style({
  position: 'absolute',
  top: space.xs,
  left: space.xs,
  lineHeight: 0,
  selectors: {
    '[dir="rtl"] &': { left: 'auto', right: space.xs },
  },
});

/** The watched share: a hairline at the frame's bottom, inside the radius. */
export const progress = style({
  position: 'absolute',
  right: space.xs,
  bottom: space.xs,
  left: space.xs,
});

export const text = style({
  display: 'block',
  minWidth: 0,
  selectors: {
    [`${tile}[data-label="below"] &`]: { paddingTop: space.xs },
    [`${tile}[data-label="overlay"] &`]: {
      position: 'absolute',
      right: space.sm,
      bottom: space.sm,
      left: space.sm,
    },
    // Leaves room for the progress hairline under the text
    [`${tile}[data-label="overlay"][data-progress] &`]: { bottom: space.lg },
    [`${tile}:disabled &`]: { color: color.textDisabled },
  },
});

/** One line with ellipsis (the one place truncation is allowed, with TV descriptions). */
export const label = style({
  display: 'block',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
});

export const supporting = style({
  display: 'block',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  marginTop: space['2xs'],
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  selectors: {
    // Over artwork the scrim carries the contrast, so supporting text stays light
    [`${tile}[data-label="overlay"] &`]: { color: color.text },
    [`${tile}:disabled &`]: { color: color.textDisabled },
  },
});
