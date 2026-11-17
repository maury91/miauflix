import { color, fontFamily, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/**
 * The profile editor (docs/plans/style-guide.md, section 13, recipe 5): the back rail, the live
 * preview with Surprise me, and the form scrolling beside it. Margins instead of flex `gap`
 * (Chromium 69).
 */
export const page = style({
  // Holds DOM focus only while a text field has virtual focus: no ring of its own
  outline: 'none',
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
  display: 'flex',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
});

export const preview = style({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: '0 0 38%',
  minWidth: 0,
  padding: `6rem ${space.xl} ${space.xl}`,
  '@media': {
    '(max-width: 760px)': { flexBasis: '40%', padding: `5rem ${space.md} ${space.md}` },
  },
});

export const title = style({
  alignSelf: 'stretch',
});

/** As wide as 52vh or the column, whichever is less; square through padding. */
export const stage = style({
  flex: 'none',
  width: '100%',
  maxWidth: '52vh',
  margin: `${space.lg} 0`,
});

export const stageSquare = style({
  position: 'relative',
  paddingBottom: '100%',
});

export const stageFill = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

/** The form column: its ScrollArea fills it. */
export const form = style({
  position: 'relative',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
});

export const formContent = style({
  boxSizing: 'border-box',
  maxWidth: '48rem',
  padding: `6rem ${space.xl} ${space.xl}`,
  '@media': {
    '(max-width: 760px)': { padding: `5rem ${space.md} ${space.md}` },
  },
});
