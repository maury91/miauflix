import { describe, expect, it } from 'vitest';

import { GLASSES, HATS, PINS } from './look';
import {
  SPRITE_SHEETS,
  spriteCell,
  spriteCrop,
  spriteDensity,
  spriteLayout,
  spriteUrl,
} from './sprites';

describe('profile option sprites', () => {
  it('has a picture for every option except none', () => {
    Object.values(SPRITE_SHEETS).forEach(sheet => {
      expect(sheet.options).not.toContain('none');
      expect(sheet.options.length).toBeLessThanOrEqual(sheet.columns * sheet.rows);
    });
    expect(SPRITE_SHEETS.hat.options).toEqual(HATS.filter(hat => hat !== 'none'));
    expect(spriteCell('hat', 'none')).toBeNull();
  });

  it('finds an option cell left to right, then top to bottom', () => {
    expect(spriteCell('glasses', GLASSES[1])).toMatchObject({ column: 0, row: 0 });
    expect(spriteCell('glasses', 'shades')).toMatchObject({ column: 1, row: 1 });
    // Pins: 3×2, the badge is the second of the bottom row
    expect(spriteCell('pin', PINS[5])).toMatchObject({ column: 1, row: 1 });
  });

  it('shifts the sheet so only that cell shows', () => {
    const cell = spriteCell('hat', 'santa');
    if (!cell) throw new Error('missing cell');
    // Hats: 4×3, Santa is the third of the middle row
    expect(spriteLayout(cell)).toEqual({
      left: '-200%',
      top: '-100%',
      width: '400%',
      height: '300%',
    });
  });

  it('fills an area with the middle of a cell', () => {
    const cell = spriteCell('fabric', 'velvet');
    if (!cell) throw new Error('missing cell');
    // Fabrics: 5×1, velvet is the third; half the cell's width and height fill the area
    expect(spriteCrop(cell, 0.5, 0.5)).toEqual({
      left: '-450%',
      top: '-50%',
      width: '1000%',
      height: '200%',
    });
  });

  it('offers each sheet at 1x, 2x and 3x', () => {
    const { hat } = SPRITE_SHEETS;
    expect(hat.url).toBe('/assets/profile/hat@1.png');
    expect(hat.srcSet).toBe(
      '/assets/profile/hat@1.png 1x, /assets/profile/hat@2.png 2x, /assets/profile/hat@3.png 3x'
    );
    expect(spriteUrl(hat, 3)).toBe('/assets/profile/hat@3.png');
  });

  it('picks the smallest density that is sharp on the screen', () => {
    expect(spriteDensity(1)).toBe(1);
    expect(spriteDensity(1.5)).toBe(2);
    expect(spriteDensity(2)).toBe(2);
    expect(spriteDensity(2.625)).toBe(3);
    expect(spriteDensity(4)).toBe(3);
  });
});
