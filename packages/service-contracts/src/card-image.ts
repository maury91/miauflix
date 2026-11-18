/**
 * Card images: a title's backdrop with its logo (or, without one, its name) drawn in, so a Home
 * card paints one image instead of two layers. Shared by the catalog (which draws them), the
 * backend (which serves them) and the frontend (which picks a size and keeps the overlay text in
 * step). No runtime dependencies: the frontend imports it.
 */

/** Pixel sizes, all 16:9. The largest is drawn first and the others scaled from it. */
export const CARD_IMAGE_SIZES = {
  sm: { width: 384, height: 216 },
  md: { width: 576, height: 324 },
  lg: { width: 780, height: 439 },
} as const;

export type CardImageSize = keyof typeof CARD_IMAGE_SIZES;
export type CardImageFormat = 'jpeg' | 'webp';

export const CARD_IMAGE_SIZE_NAMES = Object.keys(CARD_IMAGE_SIZES) as CardImageSize[];

/**
 * Where the logo (or the name) goes, as shares of the card: the logo fits inside, held at the box's
 * bottom start corner. The box ends above the tile's overlay line (an episode such as `S1 E1`,
 * which starts at about 70% of the card's height), so the two never overlap.
 */
export const CARD_IMAGE_LOGO_BOX = { left: 0.05, top: 0.18, width: 0.64, bottom: 0.66 } as const;

/** Bump when the drawing changes, so images cached for the old layout are not kept. */
export const CARD_IMAGE_LAYOUT_VERSION = 1;

/**
 * What versions a card image URL (`?rev=`) and the catalog's `x-artwork-revision` header: the
 * artwork revision drawn and the layout that drew it, so a new layout never matches a URL cached
 * forever for the old one.
 */
export function cardImageVersion(artworkRevision: number): string {
  return `${artworkRevision}.${CARD_IMAGE_LAYOUT_VERSION}`;
}

/** The smallest size at least `pixels` wide, else the largest. */
export function cardImageSizeFor(pixels: number): CardImageSize {
  return CARD_IMAGE_SIZE_NAMES.find(name => CARD_IMAGE_SIZES[name].width >= pixels) ?? 'lg';
}

/**
 * Whether the catalog can draw this name in a card image (its fonts cover Latin, Greek and
 * Cyrillic). Otherwise the card image has no name in it, and the tile shows the name as text.
 */
export function cardTitleRenderable(title: string): boolean {
  return /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]*$/u.test(
    title
  );
}
