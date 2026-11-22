import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

import { INNER_LOGO_LEFT } from './logo.css';
import {
  CORNER_LOGO_HEIGHT,
  CORNER_LOGO_TOP,
  INTRO_LOGO_HEIGHT_NARROW_PX,
  INTRO_LOGO_HEIGHT_PX,
  NARROW_MAX_WIDTH_PX,
} from './logoGeometry';

/**
 * Above a centred page's content, in its flow: always on screen. Short windows get a smaller logo
 * so it and the content still fit (a fixed height and media queries, not min(): Chromium 69).
 */
export const centred = style({
  display: 'block',
  flex: 'none',
  height: `${INTRO_LOGO_HEIGHT_PX}px`,
  width: 'auto',
  maxWidth: '90vw',
  margin: `0 auto ${space.xl}`,
  '@media': {
    '(max-height: 820px)': { height: '96px', marginBottom: space.lg },
    '(max-height: 640px)': { height: '64px', marginBottom: space.md },
    [`(max-width: ${NARROW_MAX_WIDTH_PX}px)`]: {
      height: `${INTRO_LOGO_HEIGHT_NARROW_PX}px`,
    },
  },
});

/** Where the signed-in pages have the logo, over a full-screen page (its positioned root). */
export const corner = style({
  display: 'block',
  position: 'absolute',
  zIndex: 2,
  top: CORNER_LOGO_TOP,
  left: INNER_LOGO_LEFT,
  height: CORNER_LOGO_HEIGHT,
  width: 'auto',
  pointerEvents: 'none',
});
