import { color, fontFamily, layer, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The settings pages (Configuration, Storage, Sources) and the first-run configuration wizard: the
 * back rail when there is somewhere to go back to, then the page scrolling beside it. Margins
 * instead of flex `gap` (Chromium 69).
 */
export const page = style({
  // Holds DOM focus only while a text field has virtual focus: no ring of its own
  outline: 'none',
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: layer.page,
  display: 'flex',
  overflow: 'hidden',
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
});

export const rail = style({
  position: 'relative',
  // Over the logo's backdrop: the back item sits beside the logo
  zIndex: 2,
  flex: 'none',
  height: '100%',
});

/** The scrolling column: its ScrollArea fills it. */
export const body = style({
  position: 'relative',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
});

/** Starts below the app's logo, which sits over the top of every settings page. */
export const content = style({
  boxSizing: 'border-box',
  paddingTop: '8.25rem',
  paddingBottom: space['2xl'],
  '@media': {
    '(max-width: 45em)': { paddingTop: '6rem' },
  },
});

export const header = style({
  marginBottom: space.xl,
});

export const description = style({
  marginTop: space.xs,
});
