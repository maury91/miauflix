/**
 * Home's layers on its GL surface (VITE_TV_GL_ROWS), bottom to top: the hero's backdrops (live:
 * they crossfade) under its shade (baked), together the source of the rows' fade edge; the hero's
 * details (live: their texts land one by one); the rows (a GlScroller); the focus outline.
 */
export const HOME_GL_LAYERS = {
  /** The backdrops and the baked shade: what shows through the rows' fade edge. */
  heroBackground: 'home:hero-background',
  heroBackdrops: 'home:hero-backdrops',
  heroDetails: 'home:hero-details',
  focus: 'home:focus',
} as const;
