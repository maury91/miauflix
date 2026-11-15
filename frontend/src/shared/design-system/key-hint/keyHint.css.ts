import { style } from '@vanilla-extract/css';

import { color, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * KeyHint (docs/plans/style-guide.md, section 8.5): a key cap and what it does, for keyboard and
 * remote legends. Passive text, never focusable.
 *
 * - `data-surface="solid" | "overMedia"`: caps over artwork get a dark fill for contrast
 * - `data-color="red" | "green" | "yellow" | "blue"` on a remote's colour-button cap
 */

/** The remote's colour buttons: their literal colours, not the feedback tones. */
const remoteColor = {
  red: '#E53935',
  green: '#43A047',
  yellow: '#FDD835',
  blue: '#1E88E5',
} as const;

export const hint = style({
  display: 'inline-flex',
  alignItems: 'center',
  verticalAlign: 'middle',
  color: color.textSecondary,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  whiteSpace: 'nowrap',
  selectors: {
    '&[data-surface="overMedia"]': { color: color.text },
  },
});

export const cap = style({
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '1.75rem',
  height: '1.75rem',
  padding: `0 ${space['2xs']}`,
  border: `0.0625rem solid ${color.borderControl}`,
  borderRadius: radius.sm,
  color: color.text,
  fontSize: '1.125rem',
  lineHeight: 0,
  selectors: {
    [`${hint}[data-surface="overMedia"] &`]: { backgroundColor: 'rgba(10, 13, 15, 0.6)' },
    '& + &': { marginLeft: space['2xs'] },
    '[dir="rtl"] & + &': { marginLeft: 0, marginRight: space['2xs'] },
  },
});

export const swatch = style({
  display: 'block',
  width: '0.875rem',
  height: '0.875rem',
  borderRadius: radius.sm,
  selectors: {
    '&[data-color="red"]': { backgroundColor: remoteColor.red },
    '&[data-color="green"]': { backgroundColor: remoteColor.green },
    '&[data-color="yellow"]': { backgroundColor: remoteColor.yellow },
    '&[data-color="blue"]': { backgroundColor: remoteColor.blue },
  },
});

export const label = style({
  marginLeft: space.xs,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.xs },
  },
});
