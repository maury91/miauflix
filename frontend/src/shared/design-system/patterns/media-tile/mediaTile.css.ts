import { globalStyle, style } from '@vanilla-extract/css';

import { color, space, typeScale } from '../../tokens';

/**
 * MediaTile (docs/plans/style-guide.md, section 8.6): the artwork layers inside a CollectionTile's
 * frame. The title logo sits over a landscape backdrop at the bottom start; the fallback title
 * replaces missing artwork in the same box.
 */

/** The logo's box; the image keeps its own ratio inside it, anchored at the bottom start. */
export const logo = style({
  position: 'absolute',
  left: '8%',
  bottom: '10%',
  width: '60%',
  height: '35%',
  pointerEvents: 'none',
  selectors: {
    '[dir="rtl"] &': { left: 'auto', right: '8%' },
  },
});

globalStyle(`${logo} > img`, {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  objectPosition: 'left bottom',
});

globalStyle(`[dir="rtl"] ${logo} > img`, { objectPosition: 'right bottom' });

export const fallbackTitle = style({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
  padding: space.md,
  color: color.textSecondary,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
  textAlign: 'center',
});
