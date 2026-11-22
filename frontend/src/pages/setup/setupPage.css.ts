import { color, fontFamily, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** The first-run screen: the canvas over the whole window, the form centred. */
export const page = style({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflowY: 'auto',
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
});

/** The logo over the card: centred while it fits, scrolled (from the top) once it doesn't. */
export const stack = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  margin: 'auto 0',
  padding: `${space.xl} 0`,
});

export const card = style({
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '26rem',
  padding: `0 ${space.md}`,
});
