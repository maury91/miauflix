import { color, space, typeScale } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

export const page = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 4,
  display: 'grid',
  placeItems: 'center',
  background: '#000',
  outline: 'none',
});

/** `data-held`: the last picture kept over AVPlay's plane until it plays. */
export const video = style({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  background: '#000',
  selectors: {
    '&[data-held]': { position: 'absolute', top: 0, left: 0, zIndex: 1 },
  },
});

/** Before a session: the title, what is happening, and the action a failure offers. */
export const message = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '90vw',
  maxWidth: '36rem',
  color: color.text,
  textAlign: 'center',
});

globalStyle(`${message} > * + *`, { marginTop: space.md });

export const title = style({
  margin: 0,
  color: color.text,
  ...typeScale.title,
});

/** Over the picture while it waits; read only by assistive technology once it plays. */
export const videoStatus = style({
  position: 'fixed',
  right: space.md,
  top: '5rem',
  left: space.md,
  zIndex: 1,
  margin: '0 auto',
  color: color.textSecondary,
  textAlign: 'center',
  pointerEvents: 'none',
  selectors: {
    '&[data-ready]': {
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
    },
  },
});
