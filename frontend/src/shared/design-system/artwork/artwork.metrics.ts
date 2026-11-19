import { radius, space, typeScale } from '../tokens';

/** The box's height over its width, for each fixed ratio; its corners. */
export const ARTWORK_RATIO = { landscape: 9 / 16, portrait: 3 / 2, square: 1 } as const;
export const artworkRadius = radius.md;

/** Artwork's fallback title (no image, or it failed): the CSS and the picture both use these. */
export const artworkFallback = {
  padding: space.md,
  type: typeScale.heading,
  maxLines: 3,
} as const;
