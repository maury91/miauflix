import { style, type StyleRule } from '@vanilla-extract/css';

import { color, space } from '../tokens';

/**
 * Divider (docs/plans/style-guide.md, section 8.1): a hairline between groups of content, in
 * `borderSubtle` (translucent white over media). `data-spacing` is the room on both sides along
 * the separated axis, a space token.
 */

const hairline = '0.0625rem';
const spacing: NonNullable<StyleRule['selectors']> = {};
for (const [name, value] of Object.entries(space)) {
  spacing[`&[data-orientation="horizontal"][data-spacing="${name}"]`] = {
    marginTop: value,
    marginBottom: value,
  };
  spacing[`&[data-orientation="vertical"][data-spacing="${name}"]`] = {
    marginLeft: value,
    marginRight: value,
  };
}

export const divider = style({
  flex: 'none',
  boxSizing: 'border-box',
  margin: 0,
  border: 0,
  padding: 0,
  backgroundColor: color.borderSubtle,
  selectors: {
    '&[data-orientation="horizontal"]': { display: 'block', width: '100%', height: hairline },
    // Fills the height of the row it divides
    '&[data-orientation="vertical"]': {
      display: 'inline-block',
      alignSelf: 'stretch',
      width: hairline,
      minHeight: '1em',
      verticalAlign: 'middle',
    },
    '&[data-surface="overMedia"]': { backgroundColor: 'rgba(255, 255, 255, 0.24)' },
    ...spacing,
  },
});
