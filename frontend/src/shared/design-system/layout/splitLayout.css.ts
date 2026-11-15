import { style, type StyleRule } from '@vanilla-extract/css';

import { space } from '../tokens';
import { windowClassQuery } from './windowClass';

/**
 * SplitLayout (docs/plans/style-guide.md, sections 8.1 and 10): two panes side by side from a
 * window class up, stacked below it. TV is `large`, so a TV screen is always side by side.
 *
 * Flexbox with margins instead of `gap` (flex gap is newer than Chromium 69): the end pane takes
 * the space before it, mirrored for right-to-left text, and on top when stacked. Each selector is
 * its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 *
 * - `data-split="rail" | "narrow" | "even"`: the start pane's share when side by side
 * - `data-stack-below="medium" | "expanded" | "large"`: the first window class side by side
 * - `data-gap`: a space token, between the panes
 * - `data-align`: the panes' cross-axis alignment when side by side
 * - `data-fill`: fills its parent's height; each pane then clips, to host a ScrollArea
 */

/** The start pane's fixed width in the `rail` split (search's keyboard and shortcuts). */
export const railWidth = '20rem';
/** The start pane's share in the `narrow` split (the profile editor's preview). */
export const narrowShare = '37.5%';

type Selectors = NonNullable<StyleRule['selectors']>;
type SideBySideClass = keyof typeof windowClassQuery;
const queries = Object.entries(windowClassQuery) as [SideBySideClass, string][];

/** The rules that put a split side by side, inside the media query of its first window class. */
const rootSideBySide = (from: SideBySideClass): StyleRule => ({
  selectors: {
    [`&[data-stack-below="${from}"]`]: { flexDirection: 'row' },
    [`&[data-stack-below="${from}"][data-align="start"]`]: { alignItems: 'flex-start' },
    [`&[data-stack-below="${from}"][data-align="center"]`]: { alignItems: 'center' },
    // The panes clip and scroll themselves; the split no longer does
    [`&[data-stack-below="${from}"][data-fill]`]: { overflowY: 'visible' },
  },
});

export const root = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  selectors: {
    // Stacked, a filled split scrolls as one column
    '&[data-fill]': { height: '100%', overflowY: 'auto' },
  },
  '@media': Object.fromEntries(queries.map(([name, query]) => [query, rootSideBySide(name)])),
});

const paneSideBySide = (from: SideBySideClass): StyleRule => {
  const split = `${root}[data-stack-below="${from}"]`;
  const rules: Selectors = {
    [`${split} > &`]: { flex: '1 1 0%' },
    [`${split}[data-split="rail"] > &[data-pane="start"]:not(:only-child)`]: {
      flex: `0 0 ${railWidth}`,
    },
    [`${split}[data-split="narrow"] > &[data-pane="start"]:not(:only-child)`]: {
      flex: `0 0 ${narrowShare}`,
    },
    [`${split}[data-fill] > &`]: { minHeight: 0, overflow: 'hidden' },
  };
  for (const [name, value] of Object.entries(space)) {
    const end = `${split}[data-gap="${name}"] > &[data-pane="end"]`;
    rules[end] = { marginTop: 0, marginLeft: value };
    const mirrored = { marginLeft: 0, marginRight: value };
    // Right-to-left from an ancestor, or set on the split itself
    rules[`[dir="rtl"] ${end}`] = mirrored;
    rules[`${split}[dir="rtl"][data-gap="${name}"] > &[data-pane="end"]`] = mirrored;
  }
  return { selectors: rules };
};

const stackedGaps: Selectors = {};
for (const [name, value] of Object.entries(space)) {
  // Stacked, the end pane sits under the start pane
  stackedGaps[`${root}[data-gap="${name}"] > &[data-pane="end"]`] = { marginTop: value };
}

export const pane = style({
  boxSizing: 'border-box',
  // Long content (a carousel, a long word) never widens a pane past its share
  minWidth: 0,
  selectors: stackedGaps,
  '@media': Object.fromEntries(queries.map(([name, query]) => [query, paneSideBySide(name)])),
});
