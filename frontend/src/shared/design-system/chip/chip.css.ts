import { style, type StyleRule } from '@vanilla-extract/css';

import { color, controlSize, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * Chips (docs/plans/style-guide.md, sections 4 and 8.4): pills in the `sm` (web) or `md` (TV)
 * control size, caption or label type.
 *
 * - Passive Chip: a label on an opaque quiet fill, never a focus target.
 * - FilterChip: an inverted-fill action with a hairline on solid surfaces; selected adds the
 *   translucent fill and a check (the check carries selection over media, where rest is already
 *   translucent).
 * - RemovableChip: one bordered pill holding two sibling actions, the body and the remove circle,
 *   each with its own white focus fill inside the border.
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const border = '0.0625rem';
const innerInset = '0.125rem';
const chipSizes = ['sm', 'md'] as const;

const passiveSizes: Record<string, StyleRule> = {};
for (const size of chipSizes) {
  const { height, paddingX, text } = controlSize[size];
  passiveSizes[`&[data-size="${size}"]`] = {
    height,
    paddingLeft: paddingX,
    paddingRight: paddingX,
    fontSize: typeScale[text].fontSize,
    lineHeight: typeScale[text].lineHeight,
    fontWeight: typeScale[text].fontWeight,
  };
}

/**
 * Passive: an opaque quiet fill and no border, so it never reads as a resting action (transparent
 * with a hairline on solid, translucent over media).
 */
export const chip = style({
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  verticalAlign: 'middle',
  maxWidth: '100%',
  borderRadius: radius.full,
  backgroundColor: color.surfaceRaised,
  color: color.text,
  fontFamily,
  whiteSpace: 'nowrap',
  selectors: passiveSizes,
});

/** FilterChip: the action recipe plus a hairline on solid surfaces. */
export const filter = style({
  selectors: {
    '&[data-surface="solid"]': { border: `${border} solid ${color.borderControl}` },
    '&[data-surface="solid"][data-focused]': { borderColor: color.actionFocus },
    '&[data-surface="solid"]:disabled': { borderColor: color.borderSubtle },
    '&[data-full-width]': { justifyContent: 'flex-start' },
  },
});

/** RemovableChip's pill: the border around both parts. */
export const removable = style({
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'stretch',
  verticalAlign: 'middle',
  maxWidth: '100%',
  padding: innerInset,
  border: `${border} solid ${color.borderControl}`,
  borderRadius: radius.full,
  selectors: {
    '&[data-surface="overMedia"]': {
      borderColor: 'transparent',
      backgroundColor: color.actionTranslucent,
    },
  },
});

const partSizes: Record<string, StyleRule> = {};
for (const size of chipSizes) {
  const inner = `${parseFloat(controlSize[size].height) - 2 * (parseFloat(border) + parseFloat(innerInset))}rem`;
  partSizes[`${removable}[data-size="${size}"] &`] = { height: inner, minWidth: inner };
}

/** Both parts are actions sized to fit inside the pill; over media they sit on its fill. */
export const part = style({
  selectors: {
    ...partSizes,
    [`${removable} &[data-surface="overMedia"]:not([data-focused])`]: {
      backgroundColor: 'transparent',
    },
  },
});

export const body = style({
  selectors: {
    // A body without an action is text, not a control
    '&:not(button)': { cursor: 'default' },
    [`${removable}[data-size="sm"] &`]: { paddingLeft: space.sm, paddingRight: space.xs },
    [`${removable}[data-size="md"] &`]: { paddingLeft: space.md, paddingRight: space.sm },
    [`[dir="rtl"] ${removable}[data-size="sm"] &`]: {
      paddingLeft: space.xs,
      paddingRight: space.sm,
    },
    [`[dir="rtl"] ${removable}[data-size="md"] &`]: {
      paddingLeft: space.sm,
      paddingRight: space.md,
    },
  },
});

const removeSizes: Record<string, StyleRule> = {};
for (const size of chipSizes) {
  const inner = `${parseFloat(controlSize[size].height) - 2 * (parseFloat(border) + parseFloat(innerInset))}rem`;
  removeSizes[`${removable}[data-size="${size}"] &`] = {
    width: inner,
    paddingLeft: 0,
    paddingRight: 0,
    fontSize: size === 'sm' ? '1rem' : '1.25rem',
  };
}

/** The remove circle, after the body. */
export const remove = style({
  marginLeft: space['2xs'],
  selectors: {
    ...removeSizes,
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space['2xs'] },
  },
});
