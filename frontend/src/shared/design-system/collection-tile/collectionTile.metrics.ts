import { focusRing, radius, space } from '../tokens';

/**
 * CollectionTile's numbers, shared by its CSS (collectionTile.css.ts) and its picture
 * (collectionTile.art.ts). Lengths are token strings (rem); the picture converts them to px.
 */

/** The frame's height over its width. */
export const TILE_RATIO = { landscape: 9 / 16, portrait: 3 / 2, square: 1 } as const;
export type TileRatio = keyof typeof TILE_RATIO;

export const tileMetrics = {
  radius: radius.md,
  /** Focus: the outline around the frame and the tile's scale. */
  outlineWidth: focusRing.width,
  outlineOffset: focusRing.offset,
  focusScale: 1.03,
  /** A disabled tile's frame. */
  disabledOpacity: 0.4,
  /** The progress hairline: inset from the frame's sides and bottom; ProgressBar's default height. */
  progressInset: space.xs,
  progressHeight: '0.25rem',
  /** Overlay text: inset from the frame's sides and bottom, and from the bottom over progress. */
  overlayInset: space.sm,
  overlayInsetOverProgress: space.lg,
  /** The badge: inset from the frame's top and start. */
  badgeInset: space.xs,
  /** Below text: the gap under the frame. */
  belowGap: space.xs,
  /** Between the label and the supporting text. */
  supportingGap: space['2xs'],
} as const;

/** The outline's distance from the frame (rem). */
export const outlineDistanceRem =
  parseFloat(tileMetrics.outlineWidth) + parseFloat(tileMetrics.outlineOffset);
