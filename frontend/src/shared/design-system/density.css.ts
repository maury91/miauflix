import { globalStyle } from '@vanilla-extract/css';

import { rootFontSize } from './tokens';

/**
 * Density is only the root font size (docs/plans/style-guide.md, "Units and density"). Selected by
 * a static `data-density` attribute on <html>; nothing in the app sets it yet, so importing this
 * file changes nothing until a page opts in. Storybook sets it from its density toolbar.
 */
// 100%, not 16px: the web follows the browser's default font size setting
globalStyle('html[data-density="web"]', { fontSize: '100%' });

globalStyle('html[data-density="tv"]', {
  fontSize: rootFontSize.tv,
  '@media': {
    // 720p TVs keep the same layout at web proportions (fixed: TVs have no font setting)
    '(max-width: 1280px)': { fontSize: rootFontSize.web },
  },
});
