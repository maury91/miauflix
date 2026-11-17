import { globalStyle, style } from '@vanilla-extract/css';

import { color, focusRing, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * ChoiceTileGroup (docs/plans/style-guide.md, section 8.2): one choice among options shown as
 * pictures (tiles) or colours (swatches). Tiles cannot invert, so virtual focus is the white
 * outline outside the tile, toggled with opacity; the chosen option is the translucent fill with a
 * white ring inside. Blocks rather than a centred flex column inside the button (Chromium 69
 * shrinks percentage children there), margins instead of `gap`.
 *
 * - `data-shape="tile" | "swatch"`
 * - `data-selected`, `data-focused`
 */

const rem = (value: string) => parseFloat(value);
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
const outlineInset = `-${outlineDistance}rem`;
const ring = `inset 0 0 0 ${focusRing.width} ${color.focusOutline}`;

export const group = style({
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
  fontFamily,
});

export const label = style({
  display: 'block',
  marginBottom: space.sm,
  padding: 0,
  color: color.text,
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
});

export const options = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `-${space.xs}`,
});

export const option = style({
  position: 'relative',
  boxSizing: 'border-box',
  display: 'block',
  flex: 'none',
  margin: space.xs,
  border: 0,
  color: color.text,
  fontFamily,
  textAlign: 'center',
  cursor: 'pointer',
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
  selectors: {
    '&[data-shape="tile"]': {
      width: '6.5rem',
      padding: space.xs,
      borderRadius: radius.md,
      backgroundColor: color.surfaceRaised,
    },
    '&[data-shape="tile"][data-selected]': {
      backgroundColor: color.actionTranslucent,
      boxShadow: ring,
    },
    '&[data-shape="swatch"]': {
      width: '3rem',
      height: '3rem',
      padding: 0,
      borderRadius: radius.full,
      // The swatch colour is set inline
    },
    // A canvas gap inside the ring, so the ring reads against any colour
    '&[data-shape="swatch"][data-selected]': {
      boxShadow: `${ring}, inset 0 0 0 ${rem(focusRing.width) * 2}rem ${color.canvas}`,
    },
    '&:disabled': { cursor: 'default', opacity: 0.4 },
    // The focus outline, following the radius
    '&::after': {
      content: '""',
      position: 'absolute',
      top: outlineInset,
      right: outlineInset,
      bottom: outlineInset,
      left: outlineInset,
      border: `${focusRing.width} solid ${color.focusOutline}`,
      borderRadius: `${rem(radius.md) + outlineDistance}rem`,
      opacity: 0,
      pointerEvents: 'none',
    },
    '&[data-shape="swatch"]::after': { borderRadius: radius.full },
    '&[data-focused]:not(:disabled)::after': { opacity: 1 },
  },
});

/** The tile's picture: full width; the feature's visual sets its own height (a ratio box). */
export const visual = style({
  position: 'relative',
  display: 'block',
  width: '100%',
});

export const optionLabel = style({
  display: 'block',
  marginTop: space['2xs'],
  overflow: 'hidden',
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

globalStyle(`${visual} > svg`, { display: 'block', margin: '0 auto' });
