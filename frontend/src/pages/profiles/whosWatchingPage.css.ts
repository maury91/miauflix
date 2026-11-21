import { color, controlSize, fontFamily, space } from '@shared/design-system/tokens';
import { LOGO_BACKDROP_HEIGHT } from '@shared/ui/logo/logoBackdrop.css';
import { style } from '@vanilla-extract/css';

/**
 * Who's watching (docs/plans/style-guide.md, section 8.6): the back rail when there is somewhere to
 * go back to, then the title and the ProfileTiles, each with room for its edit button, centred in
 * the room beside the rail. Margins instead of flex `gap` (Chromium 69).
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
  // Over the logo's backdrop: the back item sits beside the logo
  zIndex: 2,
  flex: 'none',
  height: '100%',
});

export const body = style({
  boxSizing: 'border-box',
  flex: '1 1 0%',
  minWidth: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // Centred by growing spacers rather than justify-content: a list taller than the screen then
  // starts at the top, where scrolling can reach it (centred overflow is cut off above)
  justifyContent: 'flex-start',
  // Clear of the logo's backdrop when the list is taller than the screen
  padding: `max(${space['2xl']}, ${LOGO_BACKDROP_HEIGHT}) ${space.xl} ${space['2xl']}`,
  overflowY: 'auto',
  selectors: {
    '&::before, &::after': { content: '""', flex: '1 0 0px' },
  },
});

export const title = style({
  marginBottom: space['2xl'],
});

export const profiles = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  maxWidth: '100%',
  margin: `-${space.md}`,
  padding: 0,
  listStyle: 'none',
  // The tiles' names, under each picture
  textAlign: 'center',
});

/** One profile: the tile fills it, so its width sets the tile's size. */
export const profile = style({
  width: '10rem',
  margin: space.md,
});

/** Under each profile: room for its edit button (an IconButton, `md`), centred. */
export const editSlot = style({
  height: controlSize.md.height,
  marginTop: space.sm,
});
