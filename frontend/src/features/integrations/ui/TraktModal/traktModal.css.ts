import { space } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

/** Trakt's own mark in its brand colour: a third-party logo, never an action or a state. */
export const mark = style({
  display: 'block',
  width: '4.5rem',
  height: '4.5rem',
  margin: '0 auto',
  color: '#ff2547',
});

/** What Trakt adds, one icon and short label each; three across, stacked on narrow windows. */
export const benefits = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `0 -${space.sm}`,
  padding: 0,
  listStyle: 'none',
});

export const benefit = style({
  display: 'flex',
  alignItems: 'center',
  flex: '1 1 10rem',
  margin: `${space.xs} ${space.sm}`,
});

globalStyle(`${benefit} > * + *`, { marginLeft: space.sm });
globalStyle(`[dir="rtl"] ${benefit} > * + *`, { marginLeft: 0, marginRight: space.sm });

/** The QR code's own picture fills the white tile PairingPanel gives it. */
export const qrCode = style({
  display: 'block',
  width: '100%',
  height: 'auto',
});
