import { style, type StyleRule } from '@vanilla-extract/css';

import { color, controlSize, controlSizes, fontFamily, radius, typeScale } from '../tokens';

/**
 * The inverted-fill action recipe (docs/plans/style-guide.md, "Actions, focus and state"), shared by
 * Button and IconButton. Every state is a static rule selected by native state or an attribute:
 *
 * - `data-surface="solid" | "overMedia"`: rest look (transparent / translucent)
 * - `data-selected`: current state (translucent)
 * - `data-focused`: white fill with black content. Focus is virtual (the navigation layer owns it,
 *   and the pointer focuses what it moves onto), so neither `:focus` nor `:hover` styles anything
 * - `:active`: pressed, a slightly darker white
 * - `:disabled`: content at 40%, no fill change
 * - `aria-busy="true"`: loading
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one pseudo-class it
 * doesn't know.
 */

const focusedLook: StyleRule = {
  backgroundColor: color.actionFocus,
  color: color.onActionFocus,
};

const sizeSelectors: Record<string, StyleRule> = {};
for (const size of controlSizes) {
  const { height, paddingX, text } = controlSize[size];
  const role = typeScale[text];
  sizeSelectors[`&[data-size="${size}"]`] = {
    height,
    minWidth: height,
    paddingLeft: paddingX,
    paddingRight: paddingX,
    fontSize: role.fontSize,
    lineHeight: role.lineHeight,
    fontWeight: role.fontWeight,
  };
  // Icon-only actions are circles: a fully rounded square
  sizeSelectors[`&[data-shape="circle"][data-size="${size}"]`] = {
    width: height,
    paddingLeft: 0,
    paddingRight: 0,
  };
}

const touchSelectors: Record<string, StyleRule> = {};
for (const size of controlSizes) {
  const extension = controlSize[size].touchExtension;
  if (extension === '0') continue;
  const offset = `-${extension}`;
  touchSelectors[`&[data-size="${size}"]::after`] = {
    content: '""',
    position: 'absolute',
    top: offset,
    right: offset,
    bottom: offset,
    left: offset,
  };
}

export const action = style({
  position: 'relative',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  verticalAlign: 'middle',
  margin: 0,
  border: 0,
  padding: 0,
  borderRadius: radius.full,
  backgroundColor: 'transparent',
  color: color.onAction,
  fontFamily,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  // Focus is virtual and shown by the fill; a mirrored DOM focus draws nothing
  outline: 'none',
  selectors: {
    ...sizeSelectors,
    '&[data-full-width]': { display: 'flex', width: '100%' },
    '&[data-surface="overMedia"]': { backgroundColor: color.actionTranslucent },
    '&[data-selected]': { backgroundColor: color.actionTranslucent },
    '&[data-focused]:not(:disabled)': focusedLook,
    '&:active:not(:disabled):not([aria-busy="true"])': {
      backgroundColor: color.actionPressed,
      color: color.onActionFocus,
    },
    '&[aria-busy="true"]': { cursor: 'progress' },
    '&:disabled': { color: color.onActionDisabled, cursor: 'default' },
  },
  '@media': {
    '(pointer: coarse)': { selectors: touchSelectors },
  },
});

const iconSizeSelectors: Record<string, StyleRule> = {};
for (const size of controlSizes) {
  const { icon, iconGap } = controlSize[size];
  iconSizeSelectors[`${action}[data-size="${size}"] &`] = { fontSize: icon };
  // A gap only when a label follows; mirrored for right-to-left text
  iconSizeSelectors[`${action}[data-size="${size}"] &:not(:last-child)`] = {
    marginRight: iconGap,
  };
  iconSizeSelectors[`[dir="rtl"] ${action}[data-size="${size}"] &:not(:last-child)`] = {
    marginRight: 0,
    marginLeft: iconGap,
  };
}

/** Holds the icon, or the spinner while loading. Icons are 1em, so the slot's font size sizes them. */
export const iconSlot = style({
  display: 'inline-flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
  selectors: iconSizeSelectors,
});

export const label = style({
  display: 'block',
});
