/** Straight (not premultiplied) RGBA, 0 to 1. */
export type Rgba = readonly [number, number, number, number];

/** A CSS colour (`#rrggbb`, `rgb()`, `rgba()`) as Rgba, its alpha times `alpha`; magenta if unknown. */
export function hex(value: string, alpha = 1): Rgba {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (match) {
    const n = parseInt(match[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
  }
  const rgba = /rgba?\(([^)]+)\)/.exec(value);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map(part => part.trim());
    return [+r / 255, +g / 255, +b / 255, +a * alpha];
  }
  return [1, 0, 1, alpha];
}

/** Rgba's colour as a 0xRRGGBB number (alpha dropped). */
export function rgbNumber([r, g, b]: Rgba) {
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}
