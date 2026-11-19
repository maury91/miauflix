import { globalStyle, style } from '@vanilla-extract/css';

import { artworkFallback } from '../../artwork/artwork.metrics';
import { color } from '../../tokens';
import { LOGO_BOX } from './mediaTile.metrics';

const percent = (share: number) => `${Math.round(share * 1e6) / 1e4}%`;

/**
 * MediaTile (docs/plans/style-guide.md, section 8.6): the artwork layers inside a CollectionTile's
 * frame. The title logo sits over a landscape backdrop at the start, above the overlay text (or a
 * card image has it drawn in already); the fallback title
 * replaces missing artwork in the same box.
 */

/**
 * The logo's box (LOGO_BOX, shared with card images); the image keeps its own ratio inside it,
 * anchored at the bottom start. It ends above the overlay line (an episode such as `S1 E1`, from
 * about 70% of the height), so the two never overlap.
 */
export const logo = style({
  position: 'absolute',
  left: percent(LOGO_BOX.left),
  top: percent(LOGO_BOX.top),
  width: percent(LOGO_BOX.width),
  height: percent(LOGO_BOX.height),
  pointerEvents: 'none',
  selectors: {
    '[dir="rtl"] &': { left: 'auto', right: percent(LOGO_BOX.left) },
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
  WebkitLineClamp: artworkFallback.maxLines,
  overflow: 'hidden',
  padding: artworkFallback.padding,
  color: color.textSecondary,
  fontSize: artworkFallback.type.fontSize,
  lineHeight: artworkFallback.type.lineHeight,
  fontWeight: artworkFallback.type.fontWeight,
  textAlign: 'center',
});
