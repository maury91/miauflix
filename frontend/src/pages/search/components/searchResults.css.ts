import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** Poster width as a share of the viewport, matching five tiles across the results column. */
export const TILE_WIDTH_VW = 10.9;

/**
 * The results row: MediaTiles side by side, scrolled to reveal the focused one. Its padding is room
 * for the tile's focus scale and outline, which the scroll container would otherwise clip; the
 * negative margin keeps the tiles aligned with the heading.
 */
export const row = style({
  display: 'flex',
  gap: '1.1vw',
  margin: `-${space.xs}`,
  padding: space.xs,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollBehavior: 'smooth',
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' },
  },
});

/** One tile's slot: the tile fills the width the row gives it. */
export const cell = style({
  flex: `0 0 ${TILE_WIDTH_VW}vw`,
  width: `${TILE_WIDTH_VW}vw`,
});

/** The heading with the result count at its end; margins rather than flex `gap` (Chromium 69). */
export const header = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: space.sm,
});

export const count = style({ flex: 'none', marginLeft: space.lg, whiteSpace: 'nowrap' });

export const notice = style({ marginBottom: space.sm });
