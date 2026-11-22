import { color, fontFamily, layer, radius, space } from '@shared/design-system/tokens';
import { style } from '@vanilla-extract/css';

/** The page's logo over the card: centred while they fit, scrolled once they don't. */
export const screen = style({
  outline: 'none',
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: layer.page,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  padding: `${space.xl} ${space.md}`,
  backgroundColor: color.canvas,
  color: color.text,
  fontFamily,
});

/** Takes the free height above and below, so it is centred and scrolls from its top. */
export const stack = style({
  flex: 'none',
  margin: 'auto 0',
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
