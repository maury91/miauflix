/**
 * The hero details' type: sizes that follow the window height between a minimum and a maximum
 * (px), as CSS `clamp(min, vh, max)` for the DOM hero and px for the drawn one. One source, so
 * the two never differ.
 */
interface FluidType {
  min: number;
  vh: number;
  max: number;
  lineHeight: number;
  weight: number;
}

export const HERO_TYPE = {
  title: { min: 32, vh: 5, max: 73.6, lineHeight: 1.05, weight: 600 },
  metadata: { min: 13.6, vh: 2.1, max: 19.2, lineHeight: 1.5, weight: 500 },
  overview: { min: 14.4, vh: 2.3, max: 20.8, lineHeight: 1.5, weight: 400 },
  status: { min: 12.16, vh: 1.8, max: 16, lineHeight: 1.4, weight: 600 },
} as const satisfies Record<string, FluidType>;

export type HeroTypeRole = keyof typeof HERO_TYPE;

/** The details' spacing (vh) and boxes. */
export const HERO_DETAILS = {
  /** Under the logo, under the title, between the metadata lines. */
  logoGapVh: 1.5,
  lineGapVh: 1,
  /** The logo's box: at most this tall, and this wide (the smaller of a share of the width and px). */
  logoHeightVh: 12,
  logoWidthVw: 28,
  logoMaxWidth: 420,
  /** Title lines, overview lines and its measure (characters). */
  titleLines: 2,
  overviewLines: 3,
  overviewCh: 62,
} as const;

/** `clamp(min, vh, max)` for a role's font size. */
export function heroTypeCss(role: HeroTypeRole) {
  const { min, vh, max } = HERO_TYPE[role];
  return `clamp(${min}px, ${vh}vh, ${max}px)`;
}

/** Every role's font size (px) in a window `windowHeight` px tall. */
export function heroTypeScale(windowHeight: number): Record<HeroTypeRole, number> {
  const size = (role: HeroTypeRole) => {
    const { min, vh, max } = HERO_TYPE[role];
    return Math.min(max, Math.max(min, (windowHeight * vh) / 100));
  };
  return {
    title: size('title'),
    metadata: size('metadata'),
    overview: size('overview'),
    status: size('status'),
  };
}
