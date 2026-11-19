import { space, typeScale } from '../tokens';

/** Artwork's fallback title (no image, or it failed): the CSS and the picture both use these. */
export const artworkFallback = {
  padding: space.md,
  type: typeScale.heading,
  maxLines: 3,
} as const;
