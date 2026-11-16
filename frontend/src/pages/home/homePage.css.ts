import { color } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * Home's page. Absolute, not fixed: a fixed element is its own stacking context, which would keep
 * the rail below the app logo. Nothing above Home scrolls, so it fills the viewport.
 */
export const page = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  overflow: 'hidden',
  backgroundColor: color.canvas,
  color: color.text,
  outline: 'none',
});

/** A wrapper that only carries `inert` (the Trakt prompt); no box of its own. */
export const contents = style({
  display: 'contents',
});

/**
 * The rows under the hero, fading in at the top. Rows span the window: each carousel centres
 * itself, and titles line up with the rows' left edge.
 */
const content = style({
  position: 'absolute',
  top: '42vh',
  right: 0,
  bottom: 0,
  left: 0,
  // Over the hero, which still layers its own parts (1 to 4)
  zIndex: 2,
  padding: '6vh 0 8vh',
  WebkitMaskImage: `linear-gradient(180deg, transparent 5vh, #000 8vh)`,
  maskImage: `linear-gradient(180deg, transparent 5vh, #000 8vh)`,
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': { display: 'none' },
  },
});

/** On the web the rows scroll natively (wheel, touch, scrollbar), animated by smooth-scroll. */
export const contentWeb = style([content, { overflowX: 'hidden', overflowY: 'auto' }]);

/**
 * On the TV the rows move on a transform transition inside a clipped content (see
 * SmoothScrollerOptions): scrolling would lay out every mounted row on every frame.
 */
export const contentTv = style([content, { overflow: 'hidden', willChange: 'transform' }]);

/** Full height of every row; only the mounted rows are rendered, each at its own offset. */
export const rows = style({
  position: 'relative',
});

export const rowsTv = style([rows, { willChange: 'transform' }]);

export const rowSlot = style({
  position: 'absolute',
  left: 0,
  right: 0,
});

export const fullPageState = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.textSecondary,
});
