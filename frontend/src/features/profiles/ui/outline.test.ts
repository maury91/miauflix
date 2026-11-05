import { describe, expect, it } from 'vitest';

import { outlinePath } from './outline';

const coordinates = (path: string) =>
  [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);

describe('outlinePath', () => {
  it('centres a tall shape horizontally', () => {
    // 1 wide, 2 tall
    const points = coordinates(
      outlinePath([
        [0, 0],
        [1, 0],
        [1, 2],
        [0, 2],
      ])
    );
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([5, 95]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([27.5, 72.5]);
  });

  it('centres a wide shape vertically', () => {
    const points = coordinates(
      outlinePath([
        [0, 0],
        [4, 0],
        [4, 1],
        [0, 1],
      ])
    );
    const ys = points.map(([, y]) => y);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([38.8, 61.3]);
  });
});
