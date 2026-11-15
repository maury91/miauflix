import { style, type StyleRule } from '@vanilla-extract/css';

import { space } from '../tokens';

/**
 * Inline (docs/plans/style-guide.md, section 8.1): a row that wraps, for chips, badges, metadata
 * and short actions. Passive layout: never a tab stop, never seizes keys.
 *
 * Every gap (and gap × row gap) is one complete rule holding `display`, `flex-wrap` and the gaps,
 * so the TV build can turn them into margins: between the items along the line (mirrored for
 * right-to-left text), under every item, and taken back under the last line.
 *
 * - `data-gap`, `data-row-gap`: space tokens; the row gap defaults to the gap
 * - `data-align`: alignment within a line; `data-justify`: distribution along it
 */

const wrapping = { display: 'flex', flexDirection: 'row', flexWrap: 'wrap' } as const;

const selectors: NonNullable<StyleRule['selectors']> = {};
for (const [gapName, gap] of Object.entries(space)) {
  selectors[`&[data-gap="${gapName}"]`] = { ...wrapping, gap };
}
for (const [gapName, gap] of Object.entries(space)) {
  for (const [rowName, rowGap] of Object.entries(space)) {
    if (rowName === gapName) continue;
    selectors[`&[data-gap="${gapName}"][data-row-gap="${rowName}"]`] = {
      ...wrapping,
      columnGap: gap,
      rowGap,
    };
  }
}
selectors['&[data-align="start"]'] = { alignItems: 'flex-start' };
selectors['&[data-align="center"]'] = { alignItems: 'center' };
selectors['&[data-align="end"]'] = { alignItems: 'flex-end' };
selectors['&[data-align="baseline"]'] = { alignItems: 'baseline' };
selectors['&[data-justify="start"]'] = { justifyContent: 'flex-start' };
selectors['&[data-justify="center"]'] = { justifyContent: 'center' };
selectors['&[data-justify="end"]'] = { justifyContent: 'flex-end' };
selectors['&[data-justify="between"]'] = { justifyContent: 'space-between' };

export const inline = style({
  ...wrapping,
  boxSizing: 'border-box',
  minWidth: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  selectors,
});
