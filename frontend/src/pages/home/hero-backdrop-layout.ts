// Keep the CSS geometry and pixel calculations on the same capped text width.
const DETAILS_LEFT_RATIO = 0.07;
const DETAILS_WIDTH_RATIO = 0.44;
const DETAILS_MAX_WIDTH = 720;
const BACKDROP_OVERLAP_RATIO = 25 / 44;
const FOCUS_FREE_SPACE_RATIO = 0.55;

export const HERO_DETAILS_WIDTH_CSS = `min(${DETAILS_WIDTH_RATIO * 100}vw, ${DETAILS_MAX_WIDTH}px)`;
export const HERO_DETAILS_LEFT_CSS = `${DETAILS_LEFT_RATIO * 100}vw`;
export const HERO_BACKDROP_LEFT_CSS = `calc(${HERO_DETAILS_LEFT_CSS} + min(25vw, ${DETAILS_MAX_WIDTH * BACKDROP_OVERLAP_RATIO}px))`;

/** Place the focus just right of the midpoint of the space beyond the capped text. */
export function getHeroBackdropLayout(heroWidth: number) {
  if (!Number.isFinite(heroWidth) || heroWidth <= 0) return null;
  const detailsWidth = Math.min(heroWidth * DETAILS_WIDTH_RATIO, DETAILS_MAX_WIDTH);
  const textRight = heroWidth * DETAILS_LEFT_RATIO + detailsWidth;
  const left = heroWidth * DETAILS_LEFT_RATIO + detailsWidth * BACKDROP_OVERLAP_RATIO;
  const width = heroWidth - left;
  const screenX = textRight + (heroWidth - textRight) * FOCUS_FREE_SPACE_RATIO;
  return { left, width, targetX: (screenX - left) / width, targetY: 0.36 };
}
