import { describe, expect, it } from 'vitest';

import { cornerRaster, GRADIENT_TEXELS, gradientRaster } from './rasters';

describe('gradientRaster', () => {
  it('ramps from one colour to the other along its axis', () => {
    const raster = gradientRaster([0, 0, 0, 1], [1, 0.5, 0, 0], 'y');

    expect([raster.width, raster.height]).toEqual([1, GRADIENT_TEXELS]);
    expect([...raster.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...raster.data.slice(-4)]).toEqual([255, 128, 0, 0]);
  });

  it('lies along x when asked', () => {
    const raster = gradientRaster([0, 0, 0, 0], [1, 1, 1, 1], 'x');
    expect([raster.width, raster.height]).toEqual([GRADIENT_TEXELS, 1]);
  });
});

describe('cornerRaster', () => {
  const alpha = (raster: ReturnType<typeof cornerRaster>, x: number, y: number) =>
    raster.data[(y * raster.width + x) * 4 + 3];

  it('cuts away the outside of the quarter circle, antialiased', () => {
    const raster = cornerRaster(8);

    // The far corner is outside the circle, the inner one inside it
    expect(alpha(raster, 0, 0)).toBe(255);
    expect(alpha(raster, 7, 7)).toBe(0);
    // The edge between is partly covered
    const edge = alpha(raster, 2, 2);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    // Symmetric across the diagonal
    expect(alpha(raster, 1, 4)).toBe(alpha(raster, 4, 1));
  });
});
