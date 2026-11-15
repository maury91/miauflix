import { style } from '@vanilla-extract/css';

import { color, duration, easing, fontFamily, space, typeScale } from '../../tokens';

/**
 * PlaybackToolbar and SeekControl (docs/plans/style-guide.md, section 8.6): the player's chrome on
 * `overMedia`. The toolbar fades with opacity (visibility follows once the fade ends, so hidden
 * controls take no pointer); the primary control sits on the seek bar's row; the seek bar draws the downloaded
 * blocks under the brand-red watched fill.
 */

export const toolbar = style({
  position: 'relative',
  boxSizing: 'border-box',
  width: '100%',
  padding: `${space['3xl']} ${space.xl} ${space.lg}`,
  backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.85) 100%)',
  color: color.text,
  fontFamily,
  opacity: 1,
  visibility: 'visible',
  transition: `opacity ${duration.standard} ${easing.standard}, visibility 0s`,
  selectors: {
    '&[data-hidden]': {
      opacity: 0,
      visibility: 'hidden',
      transition: `opacity ${duration.standard} ${easing.exit}, visibility 0s ${duration.standard}`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

export const heading = style({
  display: 'flex',
  alignItems: 'center',
  marginBottom: space.sm,
  minWidth: 0,
});

export const titles = style({
  flex: '1 1 auto',
  minWidth: 0,
});

export const busy = style({
  display: 'flex',
  flex: 'none',
  marginLeft: space.sm,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.sm },
  },
});

export const controls = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginTop: space.sm,
});

export const controlsEnd = style({
  display: 'flex',
  alignItems: 'flex-start',
  marginLeft: space.md,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.md },
  },
});

/** The primary control (play/pause), then the seek bar filling the rest. */
export const seekRow = style({
  display: 'flex',
  alignItems: 'center',
});

export const primary = style({
  flex: 'none',
  marginRight: space.md,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.md },
  },
});

export const seekSlot = style({
  flex: '1 1 auto',
  minWidth: 0,
});

export const seek = style({
  display: 'flex',
  alignItems: 'center',
});

export const time = style({
  flex: 'none',
  minWidth: '4.5rem',
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  fontVariantNumeric: 'tabular-nums',
  selectors: {
    '&[data-edge="start"]': { marginRight: space.md, textAlign: 'right' },
    '&[data-edge="end"]': { marginLeft: space.md },
    '[dir="rtl"] &[data-edge="start"]': { marginRight: 0, marginLeft: space.md, textAlign: 'left' },
    '[dir="rtl"] &[data-edge="end"]': { marginLeft: 0, marginRight: space.md },
  },
});

export const bar = style({
  flex: '1 1 auto',
  minWidth: 0,
});

/** A downloaded stretch: light grey over the track, under the watched fill. */
export const downloaded = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  backgroundColor: 'rgba(255, 255, 255, 0.55)',
});

/** The seek bar's thumb: the brand paw, its pads resting on the track. */
export const paw = style({
  display: 'block',
  fontSize: '2rem',
  transform: 'translateY(-13%)',
});
