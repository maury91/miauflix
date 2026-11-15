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

export const card = style({
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: '26rem',
  padding: `0 ${space.md}`,
});
