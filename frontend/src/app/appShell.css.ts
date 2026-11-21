import { color } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** A blank screen while a page is chosen or its chunk loads (under the logo, at 1002). */
export const loading = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: color.canvas,
  zIndex: 999,
});

/** An unknown route: a full screen with the way back Home. */
export const notFound = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: color.canvas,
});
