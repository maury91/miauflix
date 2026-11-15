import { style, type StyleRule } from '@vanilla-extract/css';

import { space } from '../tokens';

/**
 * Stack (docs/plans/style-guide.md, section 8.1): children along one axis, spaced by a space
 * token. Passive layout: never a tab stop, never seizes keys.
 *
 * Every direction × gap pair is one complete rule (`display`, `flex-direction` and `gap`
 * together), so the TV build can turn the gap into margins between the children: Chromium 69 only
 * applies `gap` to grids, and the build reads the direction from the same rule.
 *
 * - `data-direction="column" | "row"`
 * - `data-gap`: a space token; absent, no gap
 * - `data-align`: cross-axis alignment; `data-justify`: main-axis distribution
 */

const flexValue = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
  between: 'space-between',
} as const;

const selectors: NonNullable<StyleRule['selectors']> = {};
for (const direction of ['column', 'row'] as const) {
  selectors[`&[data-direction="${direction}"]`] = { display: 'flex', flexDirection: direction };
  for (const [name, value] of Object.entries(space)) {
    selectors[`&[data-direction="${direction}"][data-gap="${name}"]`] = {
      display: 'flex',
      flexDirection: direction,
      gap: value,
    };
  }
}
for (const align of ['start', 'center', 'end', 'stretch', 'baseline'] as const) {
  selectors[`&[data-align="${align}"]`] = { alignItems: flexValue[align] };
}
for (const justify of ['start', 'center', 'end', 'between'] as const) {
  selectors[`&[data-justify="${justify}"]`] = { justifyContent: flexValue[justify] };
}

export const stack = style({
  boxSizing: 'border-box',
  minWidth: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  selectors,
});
