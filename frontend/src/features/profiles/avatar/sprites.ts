import { EYES, FABRICS, GLASSES, HATS, MOUSTACHES, MOUTHS, NECKS, PINS } from './look';
import geometry from './sprite-sheets.json';

/**
 * A sheet of option pictures, in the library's option order without `none`, left to right then
 * top to bottom. `npm run generate:profile-sprites` builds it from the originals in
 * `assets/profile/` as `public/assets/profile/<file>@<density>.png`: a grid of equal cells, each
 * one tile picture (`SPRITE_AREA_RATIO`) with its option centred.
 */
export interface SpriteSheet {
  /** The @1 picture; `srcSet` adds the high-density ones. */
  url: string;
  srcSet: string;
  columns: number;
  rows: number;
  options: readonly string[];
}

export const SPRITE_DENSITIES: readonly number[] = geometry.densities;

const sheetUrl = (file: string, density: number) =>
  `${import.meta.env.BASE_URL}assets/profile/${file}@${density}.png`;

/** The density to use for something a `srcset` cannot pick (CSS masks). */
export function spriteDensity(
  pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
): number {
  return (
    SPRITE_DENSITIES.find(density => density >= pixelRatio) ??
    SPRITE_DENSITIES[SPRITE_DENSITIES.length - 1]
  );
}

/** The sheet's picture for `density`. */
export const spriteUrl = (sheet: SpriteSheet, density: number) =>
  sheet.url.replace(/@1\.png$/, `@${density}.png`);

/** Where one option sits on its sheet. */
export interface SpriteCell {
  sheet: SpriteSheet;
  column: number;
  row: number;
}

const withoutNone = (values: readonly string[]) => values.filter(value => value !== 'none');

type SpriteCategory = keyof typeof geometry.sheets;

const SPRITE_OPTIONS: Record<SpriteCategory, readonly string[]> = {
  eyes: EYES,
  mouth: withoutNone(MOUTHS),
  cheeks: ['blush'],
  fabric: FABRICS,
  moustache: withoutNone(MOUSTACHES),
  glasses: withoutNone(GLASSES),
  hat: withoutNone(HATS),
  neck: withoutNone(NECKS),
  pin: withoutNone(PINS),
};

export const SPRITE_SHEETS = Object.fromEntries(
  (Object.keys(SPRITE_OPTIONS) as SpriteCategory[]).map(category => {
    const { file, columns, rows } = geometry.sheets[category];
    const sheet: SpriteSheet = {
      columns,
      rows,
      url: sheetUrl(file, 1),
      srcSet: SPRITE_DENSITIES.map(density => `${sheetUrl(file, density)} ${density}x`).join(', '),
      options: SPRITE_OPTIONS[category],
    };
    return [category, sheet];
  })
) as Record<SpriteCategory, SpriteSheet>;

/** The picture of `option` in `category`, or null when it has none (e.g. `none`). */
export function spriteCell(category: SpriteCategory, option: string): SpriteCell | null {
  const sheet = SPRITE_SHEETS[category];
  const index = sheet.options.indexOf(option);
  if (index < 0) return null;
  return { sheet, column: index % sheet.columns, row: Math.floor(index / sheet.columns) };
}

/** The area every option picture is fitted into, width over height. */
export const SPRITE_AREA_RATIO = geometry.areaRatio;

const percent = (value: number) => `${Number(value.toFixed(4))}%`;

/**
 * Placement of the sheet that shows one cell in a `SPRITE_AREA_RATIO` area. Percentages (rather
 * than `aspect-ratio` or `object-position`) keep it working on the 2020 TVs.
 */
export function spriteLayout({ sheet, column, row }: SpriteCell) {
  return {
    left: percent(-column * 100),
    top: percent(-row * 100),
    width: percent(sheet.columns * 100),
    height: percent(sheet.rows * 100),
  };
}

/**
 * Placement of the sheet that fills an area with the middle of one cell: a `width` × `height`
 * share of the cell (e.g. the inside of a fabric swatch, away from its shaded edges), centred.
 */
export function spriteCrop({ sheet, column, row }: SpriteCell, width: number, height: number) {
  const cellWidth = 100 / width;
  const cellHeight = 100 / height;
  return {
    left: percent(-column * cellWidth - (cellWidth - 100) / 2),
    top: percent(-row * cellHeight - (cellHeight - 100) / 2),
    width: percent(sheet.columns * cellWidth),
    height: percent(sheet.rows * cellHeight),
  };
}
