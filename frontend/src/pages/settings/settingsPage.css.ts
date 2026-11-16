import { color, fontFamily, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The settings screen (docs/plans/style-guide.md, section 8): the back rail, then the title and the
 * list of settings areas. Margins instead of flex `gap` (Chromium 69).
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
});

export const rail = style({
  position: 'relative',
  flex: 'none',
  height: '100%',
});

/** Everything right of the rail; the app logo sits over its top. */
export const body = style({
  position: 'relative',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
});

export const content = style({
  boxSizing: 'border-box',
  maxWidth: '48rem',
  margin: '0 auto',
  padding: `6rem ${space.lg} ${space.xl}`,
});

export const title = style({
  marginBottom: space.lg,
});

export const note = style({
  marginTop: space.lg,
});
