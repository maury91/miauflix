import { describe, expect, it } from 'vitest';

import { hex, rgbNumber } from './color';

describe('hex', () => {
  it('reads #rrggbb with an alpha', () => {
    expect(hex('#ff8000', 0.5)).toEqual([1, 128 / 255, 0, 0.5]);
  });

  it('reads rgb() and rgba(), multiplying the alpha', () => {
    expect(hex('rgb(255, 0, 0)')).toEqual([1, 0, 0, 1]);
    expect(hex('rgba(0,0,0,0.6)', 0.5)).toEqual([0, 0, 0, 0.3]);
  });

  it('shows what it cannot read in magenta', () => {
    expect(hex('red')).toEqual([1, 0, 1, 1]);
  });
});

describe('rgbNumber', () => {
  it('packs the colour, dropping the alpha', () => {
    expect(rgbNumber([1, 0.5, 0, 0.2])).toBe(0xff8000);
  });
});
