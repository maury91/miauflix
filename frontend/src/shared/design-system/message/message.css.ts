import { globalStyle, style, type StyleRule } from '@vanilla-extract/css';

import { color, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * Message (docs/plans/style-guide.md, section 8.5): the one owner of feedback visuals. The tone
 * colors only the icon and, on a banner, the accent edge; text stays in the text colors so it is
 * readable whatever the tone, and the icon (never color alone) carries the meaning.
 *
 * - `data-tone="info" | "success" | "warning" | "danger"`
 * - `data-variant="inline" | "banner"`: inline sits in a form or panel without a box; a banner is
 *   a raised box with an accent edge
 */

const tones = {
  info: color.info,
  success: color.success,
  warning: color.warning,
  danger: color.danger,
};

const toneSelectors: Record<string, StyleRule> = {};
for (const [tone, value] of Object.entries(tones)) {
  toneSelectors[`&[data-tone="${tone}"][data-variant="banner"]`] = { borderLeftColor: value };
  toneSelectors[`[dir="rtl"] &[data-tone="${tone}"][data-variant="banner"]`] = {
    borderLeftColor: 'transparent',
    borderRightColor: value,
  };
}

export const message = style({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'flex-start',
  minWidth: 0,
  color: color.text,
  fontFamily,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
  overflowWrap: 'break-word',
  selectors: {
    '&[data-variant="banner"]': {
      padding: `${space.sm} ${space.md}`,
      border: '0 solid transparent',
      borderLeftWidth: space['2xs'],
      borderRadius: radius.md,
      backgroundColor: color.surfaceRaised,
    },
    '[dir="rtl"] &[data-variant="banner"]': { borderLeftWidth: 0, borderRightWidth: space['2xs'] },
    ...toneSelectors,
  },
});

const iconSelectors: Record<string, StyleRule> = {};
for (const [tone, value] of Object.entries(tones)) {
  iconSelectors[`${message}[data-tone="${tone}"] &`] = { color: value };
}

/** The tone's icon, one body line tall so it centres on the first line. */
export const icon = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  height: `${parseFloat(typeScale.body.fontSize) * parseFloat(typeScale.body.lineHeight)}rem`,
  marginRight: space.sm,
  fontSize: '1.25rem',
  lineHeight: 0,
  selectors: {
    ...iconSelectors,
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.sm },
  },
});

export const content = style({
  display: 'flex',
  flex: '1 1 auto',
  flexWrap: 'wrap',
  alignItems: 'center',
  minWidth: 0,
});

export const text = style({
  flex: '1 1 14rem',
  minWidth: 0,
});

export const title = style({
  display: 'block',
  fontWeight: typeScale.label.fontWeight,
});

export const body = style({
  display: 'block',
  color: color.textSecondary,
  selectors: {
    // Without a title the body is the message itself
    '&:first-child': { color: color.text },
  },
});

/**
 * One or two actions: after the text on a wide banner, below it when narrow or inline. Never wider
 * than the message: the buttons wrap onto a second line instead of overflowing.
 */
export const actions = style({
  display: 'flex',
  flex: '0 1 auto',
  flexWrap: 'wrap',
  alignItems: 'center',
  maxWidth: '100%',
  minWidth: 0,
  selectors: {
    [`${message}[data-variant="banner"] &`]: { marginLeft: space.md },
    [`[dir="rtl"] ${message}[data-variant="banner"] &`]: { marginLeft: 0, marginRight: space.md },
    [`${message}[data-variant="inline"] &`]: { flexBasis: '100%' },
  },
});

/** Spacing between the actions, also when they wrap; mirrored for right-to-left text. */
globalStyle(`${actions} > *`, { marginTop: space.xs });
globalStyle(`${actions} > *:not(:last-child)`, { marginRight: space.xs });
globalStyle(`[dir="rtl"] ${actions} > *:not(:last-child)`, {
  marginRight: 0,
  marginLeft: space.xs,
});
