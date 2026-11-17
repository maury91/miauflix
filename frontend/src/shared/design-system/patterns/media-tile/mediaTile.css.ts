import { globalStyle, style } from '@vanilla-extract/css';

import { color, space, typeScale } from '../../tokens';

/**
 * MediaTile (docs/plans/style-guide.md, section 8.6): the artwork layers inside a CollectionTile's
 * frame. The title logo sits over a landscape backdrop at the start, above the overlay text (or a
 * card image has it drawn in already); the fallback title
 * replaces missing artwork in the same box.
 */

/**
 * The logo's box; the image keeps its own ratio inside it, anchored at the bottom start. It ends
 * above the overlay line (an episode such as `S1 E1`, from about 70% of the height), so the two
 * never overlap. Card images draw their logo in the same box (CARD_IMAGE_LOGO_BOX in
 * @miauflix/service-contracts): keep them in step.
 */
export const logo = style({
  position: 'absolute',
  left: '5%',
  top: '18%',
  width: '64%',
  height: '48%',
  pointerEvents: 'none',
  selectors: {
    '[dir="rtl"] &': { left: 'auto', right: '5%' },
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
