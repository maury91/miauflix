import { color, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

import { CORNER_LOGO_HEIGHT, CORNER_LOGO_TOP } from './logoGeometry';

/** From the top of the screen to a little below the corner logo. */
export const LOGO_BACKDROP_HEIGHT = `calc(${CORNER_LOGO_TOP} + ${CORNER_LOGO_HEIGHT} + ${space.md})`;

/**
 * Over the top of a full-screen page, under the app's logo (fixed, above every page) and the
 * page's rail (z-index 2), so what scrolls up passes under a solid strip instead of through the logo. A short
 * fade below softens where the content disappears.
 */
export const backdrop = style({
  position: 'absolute',
  top: 0,
  right: 0,
  left: 0,
  zIndex: 1,
  height: LOGO_BACKDROP_HEIGHT,
  backgroundColor: color.canvas,
  pointerEvents: 'none',
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      top: '100%',
      right: 0,
      left: 0,
      height: space.md,
      backgroundImage: `linear-gradient(${color.canvas}, rgba(10, 13, 15, 0))`,
    },
  },
});
