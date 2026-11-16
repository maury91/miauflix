import { space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** Tiles per mosaic row: the `search-results` grid group's columns. */
export const RESULT_COLUMNS = 4;

/**
 * Share of the viewport one tile takes, for the artwork size requested: the results column is
 * about three quarters of the screen beside the keyboard column.
 */
export const TILE_WIDTH_VW = 75 / RESULT_COLUMNS;

/**
 * The scrolling part of the results column, under the field: the heading, then the mosaic. Its
 * padding is room for the tile's focus scale and outline, which the scroll container would
 * otherwise clip; the negative margin keeps everything aligned with the field.
 */
export const section = style({
  flex: '1 1 0%',
  minHeight: 0,
  margin: `0 -${space.xs}`,
  padding: `0 ${space.xs} ${space.xl}`,
  overflowX: 'hidden',
  overflowY: 'auto',
  scrollBehavior: 'smooth',
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' },
  },
});

/** The mosaic: Home's landscape tiles, wrapping into rows; margins rather than `gap` (Chromium 69). */
export const mosaic = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `-${space.xs}`,
  padding: `${space.xs} 0`,
});

/** One tile's slot: the tile fills the width the row gives it. */
export const cell = style({
  boxSizing: 'border-box',
  flex: `0 0 ${100 / RESULT_COLUMNS}%`,
  width: `${100 / RESULT_COLUMNS}%`,
  padding: space.xs,
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
