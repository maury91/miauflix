import { style, type StyleRule } from '@vanilla-extract/css';

import { color, fontFamily, typeScale } from '../tokens';

/**
 * Text and Heading (docs/plans/style-guide.md, sections 5 and 8.1): the type scale's named roles,
 * nothing else. States are attributes:
 *
 * - `data-variant`: the type role (size, line height, weight)
 * - `data-tone="secondary" | "disabled"`: helper and unavailable text; primary by default
 * - `data-lines`: truncation, one line with an ellipsis or several clamped (Chromium 69 has the
 *   prefixed line clamp); the full text stays in the DOM for assistive technology
 * - `data-align="center" | "end"`: start by default, mirrored for right-to-left text
 */

const roles: NonNullable<StyleRule['selectors']> = {};
for (const [name, role] of Object.entries(typeScale)) {
  roles[`&[data-variant="${name}"]`] = {
    fontSize: role.fontSize,
    lineHeight: role.lineHeight,
    fontWeight: role.fontWeight,
  };
}

const clamps: NonNullable<StyleRule['selectors']> = {};
for (const lines of [2, 3, 4, 5, 6]) {
  clamps[`&[data-lines="${lines}"]`] = {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  };
}

export const text = style({
  margin: 0,
  padding: 0,
  minWidth: 0,
  color: color.text,
  fontFamily,
  overflowWrap: 'break-word',
  // The app's global heading rule uppercases and lightens h1–h6
  fontStyle: 'normal',
  textTransform: 'none',
  selectors: {
    ...roles,
    '&[data-tone="secondary"]': { color: color.textSecondary },
    '&[data-tone="disabled"]': { color: color.textDisabled },
    '&[data-align="center"]': { textAlign: 'center' },
    '&[data-align="end"]': { textAlign: 'right' },
    '[dir="rtl"] &[data-align="end"]': { textAlign: 'left' },
    '&[data-lines="1"]': {
      display: 'block',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
    },
    ...clamps,
  },
});
