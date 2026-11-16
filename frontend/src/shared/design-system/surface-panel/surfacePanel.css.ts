import { style, type StyleRule } from '@vanilla-extract/css';

import { color, radius, space } from '../tokens';

/**
 * Surface (docs/plans/style-guide.md, sections 3 and 8.1): a passive container on the surface
 * ladder. Attributes:
 *
 * - `data-level="surface" | "raised"`: the ladder step (raised also reads as elevation)
 * - `data-border`: a `borderSubtle` hairline
 * - `data-radius`, `data-padding`: shape and space tokens
 * - `data-fill`: the parent's full height
 */

const tokens: NonNullable<StyleRule['selectors']> = {};
for (const [name, value] of Object.entries(radius)) {
  tokens[`&[data-radius="${name}"]`] = { borderRadius: value };
}
for (const [name, value] of Object.entries(space)) {
  tokens[`&[data-padding="${name}"]`] = { padding: value };
}

export const surface = style({
  boxSizing: 'border-box',
  minWidth: 0,
  margin: 0,
  border: '0.0625rem solid transparent',
  color: color.text,
  backgroundColor: color.surface,
  selectors: {
    '&[data-level="raised"]': { backgroundColor: color.surfaceRaised },
    '&[data-border]': { borderColor: color.borderSubtle },
    '&[data-fill]': { height: '100%' },
    ...tokens,
  },
});
