import { style } from '@vanilla-extract/css';

import { color, duration, easing, space } from '../tokens';

/**
 * Carousel (docs/plans/style-guide.md, sections 5, 6 and 8.4): items placed by `translateX` from the
 * collection geometry and a track moved by `translateX`, never laid out by the browser or
 * scrolled. A new target mid-transition retargets from where the track is. Geometry values are
 * final inline pixels (the documented exception to the rem rule); everything else is here.
 */

export const root = style({
  position: 'relative',
});

/**
 * Clips the track to the whole items plus the peek on each side; centred in the row.
 *
 * A stacking context (`z-index: 0`): while the track slides, Chromium can't tell where it will be
 * and assumes it overlaps everything painted after it in its stacking context. Without one here,
 * every later row's items, edges and clips took a compositing layer of their own for the length of
 * each move (23 layers at rest, ~112 during a move on the TV), each rasterized afresh. Contained,
 * the assumption stops at this row.
 */
export const viewport = style({
  position: 'relative',
  zIndex: 0,
  boxSizing: 'content-box',
  margin: '0 auto',
  // Room for the focus scale and outline above and below the items
  padding: `${space.xs} 0`,
  overflow: 'hidden',
});

export const track = style({
  position: 'absolute',
  top: space.xs,
  left: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  transition: `transform ${duration.fast} ${easing.standard}`,
  selectors: {
    // On the TV (software raster) the track keeps its own layer: a move only slides it, instead
    // of lifting it onto a layer, rasterizing it and painting it back into the page each time.
    'html[data-density="tv"] &': { willChange: 'transform' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

export const slot = style({
  position: 'absolute',
  top: 0,
  left: 0,
  selectors: {
    // The focused tile scales over its neighbours
    '&[data-focused]': { zIndex: 1 },
  },
});

/** Fades the peeking items into the canvas where more content waits. Static, never animated. */
export const edge = style({
  position: 'absolute',
  zIndex: 2,
  top: 0,
  bottom: 0,
  pointerEvents: 'none',
  selectors: {
    '&[data-side="start"]': {
      left: 0,
      background: `linear-gradient(to right, ${color.canvas} 0%, rgba(10, 13, 15, 0) 100%)`,
    },
    '&[data-side="end"]': {
      right: 0,
      background: `linear-gradient(to left, ${color.canvas} 0%, rgba(10, 13, 15, 0) 100%)`,
    },
  },
});

/** The pointer's page buttons, over the peek on each side. */
export const pageButton = style({
  position: 'absolute',
  zIndex: 3,
  top: '50%',
  transform: 'translateY(-50%)',
  selectors: {
    '&[data-side="start"]': { left: space.xs },
    '&[data-side="end"]': { right: space.xs },
  },
});
