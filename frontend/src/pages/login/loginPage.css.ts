import { color, fontFamily, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** The login screen: the canvas over the whole window, its content centred. */
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
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
});

/** The form and the pairing panel, side by side. */
export const content = style({
  width: '100%',
  maxWidth: '56rem',
});

/** The remote legend, under the content. */
export const legend = style({
  position: 'absolute',
  bottom: space['2xl'],
  left: 0,
  right: 0,
});
