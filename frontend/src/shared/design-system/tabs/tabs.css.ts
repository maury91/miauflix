import { globalStyle, style } from '@vanilla-extract/css';

import { space } from '../tokens';

/**
 * Tabs (docs/plans/style-guide.md, sections 4 and 8.2): tabs are Buttons (pills, inverted fill):
 * the selected tab has the translucent fill, the focused one is white. The tablist lays them out;
 * labels never wrap.
 */

export const tablist = style({
  display: 'flex',
  alignItems: 'center',
  selectors: {
    '&[data-orientation="vertical"]': { flexDirection: 'column', alignItems: 'stretch' },
  },
});

globalStyle(`${tablist}[data-orientation="horizontal"] > * + *`, { marginLeft: space.xs });
globalStyle(`[dir="rtl"] ${tablist}[data-orientation="horizontal"] > * + *`, {
  marginLeft: 0,
  marginRight: space.xs,
});
globalStyle(`${tablist}[data-orientation="vertical"] > * + *`, { marginTop: space['2xs'] });
// Vertical tabs read as a list: labels start at the same edge
globalStyle(`${tablist}[data-orientation="vertical"] > *`, { justifyContent: 'flex-start' });

export const panel = style({
  outline: 'none',
});
