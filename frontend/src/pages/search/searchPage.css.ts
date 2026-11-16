import { color, fontFamily, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The search screen (docs/plans/style-guide.md, section 8): the back rail, then the field over the
 * keyboard and the column of shortcuts and results beside it. Margins instead of flex `gap`
 * (Chromium 69).
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

export const body = style({
  boxSizing: 'border-box',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
  padding: `6rem ${space.xl} 0`,
});

export const field = style({ maxWidth: '40rem', marginBottom: space.xl });

export const columns = style({
  display: 'flex',
  // The keyboard keeps its rows while the results make the column beside it taller
  alignItems: 'flex-start',
});

/** The keyboard pane: SplitLayout's `rail` share. */
export const keyboard = style({ flex: '0 0 20rem', width: '20rem', marginRight: space['2xl'] });

export const side = style({ flex: '1 1 0%', minWidth: 0 });
