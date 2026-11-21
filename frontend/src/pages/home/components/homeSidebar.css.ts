import { style } from '@vanilla-extract/css';

/**
 * Home's rail over the page's left edge. Above the app logo, which is still positioned by the
 * legacy chrome (z-index 1002, see shared/brand/logo); the rail comes later in the document.
 */
export const position = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  zIndex: 1002,
  display: 'flex',
});

/**
 * The watching profile's Plushie in the icon slot: centred on it, so the label lines up with the
 * other items, and drawn larger, since the picture has room around the Plushie for hats.
 */
export const avatarSlot = style({
  position: 'relative',
  display: 'inline-block',
  width: '1em',
  height: '1em',
});

export const avatar = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '1.6em',
  height: '1.6em',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
});
