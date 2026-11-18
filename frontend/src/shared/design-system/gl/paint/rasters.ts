import type { Rgba } from '../core/color';

/** RGBA pixels, straight alpha, row by row. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Texels along a gradient's axis. */
export const GRADIENT_TEXELS = 256;

/** A two-stop gradient, GRADIENT_TEXELS along its axis, 1 across. */
export function gradientRaster(from: Rgba, to: Rgba, axis: 'x' | 'y'): Raster {
  const size = GRADIENT_TEXELS;
  const data = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    for (let c = 0; c < 4; c++)
      data[i * 4 + c] = Math.round((from[c] + (to[c] - from[c]) * t) * 255);
  }
  return { width: axis === 'x' ? size : 1, height: axis === 'x' ? 1 : size, data };
}

/**
 * What a rounded corner cuts away (top left, `size` px): white, alpha the part of each pixel
 * outside the quarter circle (4 × 4 samples).
 */
export function cornerRaster(size: number): Raster {
  const data = new Uint8ClampedArray(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let outside = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const dx = size - (px + (sx + 0.5) / samples);
          const dy = size - (py + (sy + 0.5) / samples);
          if (dx * dx + dy * dy > size * size) outside++;
        }
      const index = (py * size + px) * 4;
      data[index] = data[index + 1] = data[index + 2] = 255;
      data[index + 3] = Math.round((outside / (samples * samples)) * 255);
    }
  return { width: size, height: size, data };
}
