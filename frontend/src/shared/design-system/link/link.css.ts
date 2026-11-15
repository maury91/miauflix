import { style } from '@vanilla-extract/css';

import { color, focusRing, radius, typeScale } from '../tokens';

/**
 * Link (docs/plans/style-guide.md, sections 3, 4 and 8.2): the link colour, always underlined.
 * Links cannot invert (the fill would hide the text it sits in), so virtual focus is the white
 * outline, drawn by a pseudo-element following the radius and toggled by opacity. Attributes:
 *
 * - `data-variant="inline" | "standalone"`: in running text (inherits its type), or on its own line
 *   (the label role, with room for the outline)
 * - `data-focused`: virtual focus
 * - `data-surface="overMedia"`: white over artwork, where the link colour can't be read
 */

const rem = (value: string) => parseFloat(value);
const outlineDistance = rem(focusRing.width) + rem(focusRing.offset);
const outlineInset = `-${outlineDistance}rem`;

export const link = style({
  position: 'relative',
  color: color.link,
  textDecoration: 'underline',
  textDecorationThickness: '0.0625rem',
  textUnderlineOffset: '0.15em',
  borderRadius: radius.sm,
  cursor: 'pointer',
  // Focus is virtual and shown by the outline
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
  selectors: {
    '&[data-variant="standalone"]': {
      display: 'inline-block',
      fontSize: typeScale.label.fontSize,
      lineHeight: typeScale.label.lineHeight,
      fontWeight: typeScale.label.fontWeight,
    },
    '&[data-surface="overMedia"]': { color: color.text },
    '&::after': {
      content: '""',
      position: 'absolute',
      top: outlineInset,
      right: outlineInset,
      bottom: outlineInset,
      left: outlineInset,
      border: `${focusRing.width} solid ${color.focusOutline}`,
      borderRadius: `${rem(radius.sm) + outlineDistance}rem`,
      opacity: 0,
      pointerEvents: 'none',
    },
    '&[data-focused]::after': { opacity: 1 },
  },
});
