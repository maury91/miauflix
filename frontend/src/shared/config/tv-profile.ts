import { env } from './env';

export type ImageSizeName = 'w300' | 'w780' | 'w1280' | 'original';
/** Smallest first, with the width each is served at (the original is at least 1920 wide). */
const IMAGE_SIZES: readonly (readonly [ImageSizeName, number])[] = [
  ['w300', 300],
  ['w780', 780],
  ['w1280', 1280],
  ['original', Infinity],
];
/** The hero backdrop's share of the screen's width (1344 of 1920 pixels). */
const HERO_BACKDROP_SHARE = 0.7;

export interface TvDevice {
  /** The TV's model year, from its model code; null when the TV does not report it. */
  modelYear: number | null;
  /** The browser's Chromium version, from its user agent. */
  chromium: number | null;
  /** The app's width in device pixels (1920 on a 4K TV too: the TV scales the app up). */
  screenWidth: number;
}

export interface HeroBackdropSizes {
  /** While the selection moves: each new backdrop is decoded and painted during a move. */
  moving: ImageSizeName;
  /** Once the selection rests, loaded while idle and swapped in. */
  resting: ImageSizeName;
}

/**
 * The largest backdrops each generation of TV paints without dropping frames, newest first. A TV
 * older than every entry, or one that reports no year, gets the last. The hero asks for the
 * smallest size that covers it, up to these.
 */
const TV_TIERS: readonly ({ fromYear: number } & HeroBackdropSizes)[] = [
  // A 2023 QCQ80 (4 cores, 2 GB, Tizen 9) decodes a w1280 backdrop in 70 ms and a 1920 original
  // in 97 ms: w1280 nearly covers the hero (1344 pixels) and keeps moves smooth
  { fromYear: 2023, moving: 'w1280', resting: 'original' },
  // A 2020 TU8072 (Tizen 5.5, Chromium 69) rasterizes in software: a w780 backdrop keeps moves
  // smooth, where the original (often 4K) took about half a second to decode
  { fromYear: 0, moving: 'w780', resting: 'w1280' },
];

const sizeIndex = (size: ImageSizeName) => IMAGE_SIZES.findIndex(([name]) => name === size);
/** The smallest size at least this wide, but not larger than `cap`. */
const fit = (pixels: number, cap: ImageSizeName): ImageSizeName => {
  const covering = IMAGE_SIZES.findIndex(([, width]) => width >= pixels);
  return IMAGE_SIZES[Math.min(covering, sizeIndex(cap))]![0];
};

/**
 * The year of the first TVs with each Tizen's browser, for a TV whose model code is unknown. A
 * TV keeps getting Tizen updates, so this only bounds its year from above.
 */
const CHROMIUM_YEARS: readonly [chromium: number, year: number][] = [
  [120, 2025],
  [108, 2024],
  [94, 2023],
  [85, 2022],
  [76, 2021],
];

const yearOf = ({ modelYear, chromium }: TvDevice): number | null => {
  if (modelYear) return modelYear;
  if (!chromium) return null;
  return CHROMIUM_YEARS.find(([version]) => chromium >= version)?.[1] ?? 2020;
};

const sizeSetting = (value: string): ImageSizeName | null => {
  if (value === 'auto' || !value) return null;
  if (IMAGE_SIZES.some(([name]) => name === value)) return value as ImageSizeName;
  console.warn(`Unknown TV hero backdrop size "${value}", using auto`);
  return null;
};

/**
 * The hero backdrop sizes for this TV: the packaged settings, else the smallest that covers the
 * hero, up to what its tier in the catalog paints smoothly.
 */
export function heroBackdropSizes(
  device: TvDevice,
  settings: { moving: string; resting: string }
): HeroBackdropSizes {
  const year = yearOf(device) ?? 0;
  const tier = TV_TIERS.find(entry => year >= entry.fromYear) ?? TV_TIERS[TV_TIERS.length - 1]!;
  const pixels = device.screenWidth * HERO_BACKDROP_SHARE;
  return {
    moving: sizeSetting(settings.moving) ?? fit(pixels, tier.moving),
    resting: sizeSetting(settings.resting) ?? fit(pixels, tier.resting),
  };
}

/** What this TV reports about itself. */
export function readTvDevice(): TvDevice {
  let modelYear: number | null = null;
  try {
    // `23_PTM_QTV_T09`; needs the productinfo privilege
    const code = window.webapis?.productinfo?.getModelCode?.() ?? '';
    const year = /^(\d{2})_/.exec(code)?.[1];
    if (year) modelYear = 2000 + Number(year);
  } catch {
    // No productinfo privilege: fall back to the browser's version
  }
  // Samsung's agent names the version without "Chrome/": `(KHTML, like Gecko) 120.0.6099.5/9.0 TV`
  const chromium = /Chrome\/(\d+)|\) (\d+)\.[\d.]+\/[\d.]+ TV/.exec(navigator.userAgent);
  return {
    modelYear,
    chromium: chromium ? Number(chromium[1] ?? chromium[2]) : null,
    screenWidth: window.innerWidth * (window.devicePixelRatio || 1),
  };
}

let tvHeroBackdropSizes: HeroBackdropSizes | null = null;

/** This TV's hero backdrop sizes, read once. */
export function getTvHeroBackdropSizes(): HeroBackdropSizes {
  tvHeroBackdropSizes ??= heroBackdropSizes(readTvDevice(), {
    moving: env.TV_HERO_BACKDROP,
    resting: env.TV_HERO_BACKDROP_RESTING,
  });
  return tvHeroBackdropSizes;
}
