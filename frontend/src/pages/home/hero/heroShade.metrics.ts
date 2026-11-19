/**
 * The hero's shade, shared by MediaHero's `::before`/`::after` gradients and the drawn hero.
 * Positions along the hero are "text right + a share of the free width beside the text".
 */
export const HERO_SHADE = {
  /** The radial darkening: its centre and radii (shares of the hero's width and height). */
  radial: {
    centerFree: 0.7,
    radiusX: 0.72,
    radiusY: 1.15,
    stops: [
      [0.35, 'rgba(0,0,0,0)'],
      [0.51, 'rgba(0,0,0,0.16)'],
      [0.75, 'rgba(0,0,0,0.78)'],
      [1, '#000'],
    ],
  },
  /** The side shade: opaque up to the backdrop's edge, fading out over the free width. */
  side: {
    color: '#03050d',
    /** Past the backdrop's left edge, a share of the details' width. */
    edgeFade: 0.08,
    edgeFadeColor: 'rgba(3,5,13,0.96)',
    midFree: 0.14,
    midColor: 'rgba(3,5,13,0.35)',
    endFree: 0.55,
  },
  /** The bottom shade (shares of the hero's height, from the bottom). */
  bottom: [
    [0, '#000'],
    [0.17, 'rgba(0,0,0,0.62)'],
    [0.48, 'rgba(0,0,0,0)'],
  ],
  /** The band darkening the backdrop's bottom right (`::after`): from, tall (vh) and stops. */
  band: {
    topVh: 39.5,
    heightVh: 15.5,
    leftFree: 0.285,
    stops: [
      [0, 'rgba(0,0,0,0)'],
      [0.53, 'rgba(0,0,0,0.5)'],
      [1, '#000'],
    ],
  },
} as const;
