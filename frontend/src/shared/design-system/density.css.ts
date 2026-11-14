import { globalStyle } from '@vanilla-extract/css';

import { rootFontSize } from './tokens';

/**
 * Density is only the root font size (docs/plans/style-guide.md, "Units and density"). Selected by
 * a static `data-density` attribute on <html>; nothing in the app sets it yet, so importing this
 * file changes nothing until a page opts in. Storybook sets it from its density toolbar.
 */
globalStyle('html[data-density="web"]', { fontSize: rootFontSize.web });

globalStyle('html[data-density="tv"]', {
  fontSize: rootFontSize.tv,
  '@media': {
    // 720p TVs keep the same layout at web proportions
    '(max-width: 1280px)': { fontSize: rootFontSize.web },
  },
});
