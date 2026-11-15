import { globalStyle, style } from '@vanilla-extract/css';

import { color, radius, space, typeScale } from '../../tokens';

/**
 * PairingPanel (docs/plans/style-guide.md, section 8.6): the code to scan on a white tile (QR
 * codes need a light quiet zone), the code to type, and the status. Attributes on the tile:
 *
 * - `data-state="loading" | "ready" | "expired"`: a placeholder with a spinner, the code, or the
 *   code faded behind the message asking for a new one
 */

export const panel = style({
  textAlign: 'center',
});

export const qr = style({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '11rem',
  height: '11rem',
  padding: space.sm,
  borderRadius: radius.md,
  backgroundColor: '#FFFFFF',
  selectors: {
    '&[data-state="loading"]': {
      backgroundColor: color.surfaceRaised,
      color: color.text,
    },
  },
});

globalStyle(`${qr}[data-state="expired"] > *`, { opacity: 0.15 });

export const code = style({
  margin: 0,
  color: color.text,
  fontSize: typeScale.title.fontSize,
  lineHeight: typeScale.title.lineHeight,
  fontWeight: typeScale.title.fontWeight,
  letterSpacing: '0.2em',
  // The letter spacing trails the last character too: shift it back so the code stays centred
  marginRight: '-0.2em',
  fontVariantNumeric: 'tabular-nums',
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: '-0.2em' },
  },
});

export const block = style({
  width: '100%',
});

/** The message, centred as a whole: its icon stays beside its text in the centred panel. */
export const message = style({
  display: 'flex',
  justifyContent: 'center',
});

globalStyle(`${message} > *`, { flex: '0 1 auto', textAlign: 'start' });
