import { style, type StyleRule } from '@vanilla-extract/css';

import { space } from '../tokens';
import { windowClassQuery } from './windowClass';

/**
 * Grid (docs/plans/style-guide.md, section 8.1): equal columns, a count per window class, items
 * spanning columns, spaced by space tokens. CSS grid and its `gap` work on Chromium 69. Passive
 * layout: never a tab stop, never seizes keys; a FocusGroup shares its coordinates (gridLayout).
 *
 * - `data-columns`, `data-columns-medium|expanded|large`: 1 to 12 equal columns
 * - `data-gap`, `data-row-gap`: space tokens
 * - `data-align`: alignment inside each cell
 * - on items: `data-span`, `data-span-medium|expanded|large`
 */

export const maxColumns = 12;
const counts = Array.from({ length: maxColumns }, (_, index) => index + 1);
type Selectors = NonNullable<StyleRule['selectors']>;

const perCount = (attribute: string, rule: (count: number) => StyleRule): Selectors =>
  Object.fromEntries(counts.map(count => [`&[${attribute}="${count}"]`, rule(count)]));

const columnsRule = (count: number): StyleRule => ({
  gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
});
const spanRule = (count: number): StyleRule => ({ gridColumn: `span ${count} / span ${count}` });

/** Rules for the base attribute, then each window class inside its media query. */
function responsive(name: string, rule: (count: number) => StyleRule): StyleRule {
  return {
    selectors: perCount(`data-${name}`, rule),
    '@media': Object.fromEntries(
      Object.entries(windowClassQuery).map(([windowClass, query]) => [
        query,
        { selectors: perCount(`data-${name}-${windowClass}`, rule) },
      ])
    ),
  };
}

const gapSelectors: Selectors = {};
for (const [name, value] of Object.entries(space)) {
  gapSelectors[`&[data-gap="${name}"]`] = { gap: value };
}
// After the gaps, so a row gap overrides the shared one
for (const [name, value] of Object.entries(space)) {
  gapSelectors[`&[data-row-gap="${name}"]`] = { rowGap: value };
}
const alignSelectors: Selectors = {
  '&[data-align="start"]': { alignItems: 'start' },
  '&[data-align="center"]': { alignItems: 'center' },
  '&[data-align="end"]': { alignItems: 'end' },
};

const columns = responsive('columns', columnsRule);

export const grid = style({
  boxSizing: 'border-box',
  display: 'grid',
  minWidth: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  ...columns,
  selectors: { ...columns.selectors, ...gapSelectors, ...alignSelectors },
});

export const item = style({
  boxSizing: 'border-box',
  minWidth: 0,
  ...responsive('span', spanRule),
});
