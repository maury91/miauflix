import { color, fontFamily, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The search screen (docs/plans/style-guide.md, section 8): the back rail, then the keyboard and
 * shortcuts column beside the field and results one. Margins instead of flex `gap` (Chromium 69).
 */
export const page = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 1000,
  display: 'flex',
  overflow: 'hidden',
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
  // Focused only to keep keys on the page (see SearchPage): never drawn as focused
  outline: 'none',
});

export const rail = style({
  position: 'relative',
  flex: 'none',
  height: '100%',
});

export const body = style({
  boxSizing: 'border-box',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
  display: 'flex',
  padding: `6rem ${space.xl} 0`,
});

const hiddenScrollbar = {
  scrollbarWidth: 'none',
  selectors: { '&::-webkit-scrollbar': { display: 'none' } },
} as const;

/** The keyboard (TV) over popular and recent searches: SplitLayout's `rail` share. */
export const side = style({
  boxSizing: 'border-box',
  flex: '0 0 20rem',
  width: '20rem',
  height: '100%',
  marginRight: space['2xl'],
  paddingBottom: space.xl,
  overflowY: 'auto',
  ...hiddenScrollbar,
});

export const keyboard = style({ marginBottom: space.xl });

/** The field over the results, which scroll under it. */
export const main = style({
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});

export const field = style({ flex: 'none', marginBottom: space.xl });
