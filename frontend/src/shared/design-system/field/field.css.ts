import { style, type StyleRule } from '@vanilla-extract/css';

import {
  color,
  controlSize,
  controlSizes,
  focusRing,
  fontFamily,
  radius,
  space,
  typeScale,
} from '../tokens';
import { fieldActionSize } from './fieldParts';

/**
 * Field anatomy and the input frame (docs/plans/style-guide.md, "Outline: everything that cannot
 * invert" and section 8.2). Every state is a static rule on an attribute of the frame:
 *
 * - `data-size`: height, padding and text size from the shared control size table
 * - `data-focused`: virtual focus on the input part, shown as a white outline outside the frame
 * - `data-invalid`: danger border (with the outline too when focused)
 * - `data-disabled` / `data-readonly`: quieter border; disabled text dims
 * - `data-start` / `data-end`: a slot is present, so the input's padding on that side shrinks
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const rem = (value: string) => parseFloat(value);

const borderWidth = '0.0625rem';
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
const outlineInset = `-${outlineDistance + rem(borderWidth)}rem`;

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  fontFamily,
});

export const labelRow = style({
  display: 'flex',
  alignItems: 'baseline',
  marginBottom: space.xs,
});

export const label = style({
  color: color.text,
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
});

export const indicator = style({
  marginLeft: space.xs,
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.xs },
  },
});

const supportingText: StyleRule = {
  display: 'flex',
  alignItems: 'flex-start',
  margin: `${space.xs} 0 0`,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
};

export const description = style({ ...supportingText, color: color.textSecondary });

export const error = style({ ...supportingText, color: color.danger });

export const errorIcon = style({
  flex: 'none',
  // One line of caption text tall, so the icon centres on the first line
  height: `${rem(typeScale.caption.fontSize) * rem(typeScale.caption.lineHeight)}rem`,
  marginRight: space['2xs'],
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '1.125em',
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space['2xs'] },
  },
});

const frameSizeSelectors: Record<string, StyleRule> = {};
for (const size of controlSizes) {
  const { height, text } = controlSize[size];
  const role = typeScale[text === 'label' ? 'body' : text];
  frameSizeSelectors[`&[data-size="${size}"]`] = {
    minHeight: height,
    fontSize: role.fontSize,
    lineHeight: role.lineHeight,
  };
}

export const frame = style({
  position: 'relative',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  border: `${borderWidth} solid ${color.borderControl}`,
  borderRadius: radius.md,
  backgroundColor: color.control,
  color: color.text,
  cursor: 'text',
  selectors: {
    ...frameSizeSelectors,
    '&[data-multiline]': { alignItems: 'stretch' },
    '&[data-invalid]': { borderColor: color.danger },
    '&[data-readonly]': { borderColor: color.borderSubtle },
    '&[data-disabled]': {
      borderColor: color.borderSubtle,
      color: color.textDisabled,
      cursor: 'default',
    },
    // The focus outline. Chromium 69 draws `outline` as a rectangle that ignores `border-radius`,
    // so it is a pseudo-element following the frame's shape, toggled by opacity: no layout,
    // compositing only. Offsets count from the padding box, so the border is added.
    '&::after': {
      content: '""',
      position: 'absolute',
      top: outlineInset,
      right: outlineInset,
      bottom: outlineInset,
      left: outlineInset,
      border: `${focusRing.width} solid ${color.focusOutline}`,
      // The frame's radius grown by the distance, so the ring stays parallel to the border
      borderRadius: `${rem(radius.md) + outlineDistance}rem`,
      opacity: 0,
      pointerEvents: 'none',
    },
    '&[data-focused]::after': { opacity: 1 },
  },
});

const controlSizeSelectors: Record<string, StyleRule> = {};
for (const size of controlSizes) {
  const { paddingX, iconGap } = controlSize[size];
  controlSizeSelectors[`${frame}[data-size="${size}"] &`] = {
    paddingLeft: paddingX,
    paddingRight: paddingX,
  };
  // Next to a slot, the slot's own inset or the icon gap is enough
  controlSizeSelectors[`${frame}[data-size="${size}"][data-start] &`] = { paddingLeft: iconGap };
  controlSizeSelectors[`${frame}[data-size="${size}"][data-end] &`] = { paddingRight: iconGap };
  controlSizeSelectors[`[dir="rtl"] ${frame}[data-size="${size}"][data-start] &`] = {
    paddingLeft: paddingX,
    paddingRight: iconGap,
  };
  controlSizeSelectors[`[dir="rtl"] ${frame}[data-size="${size}"][data-end] &`] = {
    paddingLeft: iconGap,
    paddingRight: paddingX,
  };
  controlSizeSelectors[`[dir="rtl"] ${frame}[data-size="${size}"][data-start][data-end] &`] = {
    paddingLeft: iconGap,
    paddingRight: iconGap,
  };
}

/** The native input or textarea: transparent, the frame paints everything. */
export const control = style({
  flex: '1 1 auto',
  alignSelf: 'stretch',
  boxSizing: 'border-box',
  width: '100%',
  minWidth: 0,
  margin: 0,
  border: 0,
  borderRadius: 0,
  backgroundColor: 'transparent',
  color: 'inherit',
  font: 'inherit',
  letterSpacing: 0,
  caretColor: color.text,
  // Focus is virtual and shown by the frame; the DOM focus of edit mode draws nothing
  outline: 'none',
  WebkitAppearance: 'none',
  selectors: {
    ...controlSizeSelectors,
    '&::placeholder': { color: color.textSecondary, opacity: 1 },
    '&:disabled': { color: color.textDisabled, cursor: 'default' },
    '&::-webkit-search-decoration': { WebkitAppearance: 'none' },
    '&::-webkit-search-cancel-button': { WebkitAppearance: 'none' },
    '&::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
    '&::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
    [`${frame}[data-centered] &`]: { textAlign: 'center' },
  },
});

/** A textarea gets vertical padding; its height comes from `rows`. */
export const multiline = style({
  paddingTop: space.xs,
  paddingBottom: space.xs,
  resize: 'vertical',
  overflow: 'auto',
});

/** A decorative leading icon, such as the search glass. */
export const decoration = style({
  display: 'inline-flex',
  flex: 'none',
  alignItems: 'center',
  color: color.textSecondary,
  lineHeight: 0,
  selectors: Object.fromEntries(
    controlSizes.flatMap(size => {
      const { paddingX, icon } = controlSize[size];
      return [
        [`${frame}[data-size="${size}"] &`, { marginLeft: paddingX, fontSize: icon }],
        [`[dir="rtl"] ${frame}[data-size="${size}"] &`, { marginLeft: 0, marginRight: paddingX }],
      ];
    })
  ),
});

/** A start or end action group, inset evenly from the frame's edge. */
export const actions = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  cursor: 'default',
  selectors: Object.fromEntries(
    controlSizes.map(size => {
      const inner = rem(controlSize[fieldActionSize[size]].height);
      const outer = rem(controlSize[size].height) - 2 * rem(borderWidth);
      return [
        `${frame}[data-size="${size}"] &`,
        { padding: `0 ${Math.max(0, (outer - inner) / 2)}rem` },
      ];
    })
  ),
});

/** Wraps one action inside an action group. */
export const slot = style({
  display: 'inline-flex',
});

/** Keeps a slot's room while its content is not available (a clear action with no text). */
export const reserved = style({
  visibility: 'hidden',
});
