import { globalStyle, style, type StyleRule } from '@vanilla-extract/css';

import { color, fontFamily, space, typeScale } from '../tokens';

/**
 * Section (docs/plans/style-guide.md, section 8.1): a heading, an optional description and
 * actions, then the content. The actions sit at the header's end and wrap below the text when
 * there is no room. Padding is a space token (`data-padding`); without it the section adds none.
 */

const paddings: NonNullable<StyleRule['selectors']> = {};
for (const [name, value] of Object.entries(space)) {
  paddings[`&[data-padding="${name}"]`] = { padding: value };
}

export const section = style({
  boxSizing: 'border-box',
  minWidth: 0,
  margin: 0,
  color: color.text,
  fontFamily,
  selectors: paddings,
});

export const header = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  // The items' start and top margins, taken back: wrapped actions line up with the heading
  marginTop: `-${space.sm}`,
  marginBottom: space.md,
  marginLeft: `-${space.md}`,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: `-${space.md}` },
  },
});

const headerItem = {
  marginTop: space.sm,
  marginLeft: space.md,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.md },
  },
} as const;

export const headerText = style({
  flex: '1 1 16rem',
  minWidth: 0,
  overflowWrap: 'break-word',
  ...headerItem,
});

export const title = style({
  margin: 0,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
  // The app's global heading rule uppercases and lightens h1–h6
  fontStyle: 'normal',
  textTransform: 'none',
});

export const description = style({
  margin: 0,
  marginTop: space['2xs'],
  color: color.textSecondary,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
});

export const actions = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  ...headerItem,
});

/** Actions are spaced without wrappers, mirrored for right-to-left text. */
globalStyle(`${actions} > * + *`, { marginLeft: space.xs });
globalStyle(`[dir="rtl"] ${actions} > * + *`, { marginLeft: 0, marginRight: space.xs });
