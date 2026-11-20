import { color, fontFamily, layer, radius, space } from '@shared/design-system/tokens';
import { NARROW_MAX_WIDTH_PX } from '@shared/ui/logo/logoGeometry';
import { style } from '@vanilla-extract/css';

/**
 * Starts below the app's logo, which stays where the login screen has it: 130px tall at
 * 50% - 380px (70px tall at 50px on narrow screens).
 */
export const screen = style({
  outline: 'none',
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: layer.page,
  boxSizing: 'border-box',
  overflowY: 'auto',
  padding: `calc(50vh - 218px) ${space.md} ${space.xl}`,
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
  '@media': {
    // Short screens push the logo off the top; keep the card from touching the edge
    '(max-height: 500px)': { paddingTop: space.xl },
    [`(max-width: ${NARROW_MAX_WIDTH_PX}px)`]: { paddingTop: '152px' },
  },
});

export const column = style({
  width: '100%',
  maxWidth: '27.5rem',
  margin: '0 auto',
});

export const markRow = style({
  display: 'flex',
  justifyContent: 'center',
});

/** The outcome's or the request's picture: a circle on the raised surface. */
export const mark = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '4rem',
  height: '4rem',
  borderRadius: radius.full,
  backgroundColor: color.surfaceRaised,
  color: color.textSecondary,
  selectors: {
    '&[data-tone="success"]': { color: color.success },
    '&[data-tone="neutral"]': { color: color.text },
  },
});

/** The login form, without its own panel (the card is its panel). */
export const signIn = style({
  alignSelf: 'stretch',
  textAlign: 'start',
});
