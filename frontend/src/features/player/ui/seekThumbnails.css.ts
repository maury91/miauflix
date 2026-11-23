import { color, duration, easing, radius, space, typeScale } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * Seek thumbnails: the TV's strip of five frames above the seek bar (the selected one centred and
 * outlined, the outer two cut by the screen's edges) and the web's frame over the hovered point.
 */

/** A tile's width as a share of the strip, and the space between tiles. */
export const TILE_SHARE = 24;
export const TILE_GAP_SHARE = 0.6;

export const strip = style({
  position: 'relative',
  width: '100%',
  // The tiles' 16:9 height, as a share of the strip's width
  paddingTop: `${(TILE_SHARE * 9) / 16}%`,
  marginBottom: space.md,
  overflow: 'hidden',
  pointerEvents: 'none',
});

export const tile = style({
  position: 'absolute',
  top: 0,
  left: 0,
  boxSizing: 'border-box',
  width: `${TILE_SHARE}%`,
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  border: '3px solid transparent',
  transition: `transform ${duration.fast} ${easing.standard}`,
  selectors: {
    '&[data-selected]': { borderColor: color.text },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

export const image = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

/** The web's frame over the hovered point of the seek bar, with its time under it. */
export const bubble = style({
  width: '12rem',
  overflow: 'hidden',
  borderRadius: radius.sm,
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  color: color.text,
  boxShadow: '0 0.25rem 1rem rgba(0, 0, 0, 0.5)',
});

export const bubbleFrame = style({
  position: 'relative',
  width: '100%',
  paddingTop: '56.25%',
});

export const bubbleImage = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const bubbleTime = style({
  display: 'block',
  padding: `${space.xs} 0`,
  textAlign: 'center',
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  fontVariantNumeric: 'tabular-nums',
});
