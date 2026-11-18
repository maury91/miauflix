import { globalStyle, style } from '@vanilla-extract/css';

import { space } from '../tokens';

/**
 * Tabs (docs/plans/style-guide.md, sections 4 and 8.2): tabs are Buttons (pills, inverted fill):
 * the selected tab has the translucent fill, the focused one is white. The tablist lays them out;
 * labels never wrap: a horizontal list too narrow for its tabs wraps onto another row instead of
 * squeezing them (a phone's profile editor).
 */

export const tablist = style({
  display: 'flex',
  alignItems: 'center',
  selectors: {
    // Rows of wrapped tabs keep a gap without flex `gap` (Chromium 69): margins, cancelled here
    '&[data-orientation="horizontal"]': {
      flexWrap: 'wrap',
      marginTop: `-${space['2xs']}`,
      marginBottom: `-${space['2xs']}`,
    },
    '&[data-orientation="vertical"]': { flexDirection: 'column', alignItems: 'stretch' },
  },
});

globalStyle(`${tablist}[data-orientation="horizontal"] > *`, {
  flexShrink: 0,
  marginTop: space['2xs'],
  marginBottom: space['2xs'],
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
