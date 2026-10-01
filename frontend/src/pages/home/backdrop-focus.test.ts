import { describe, expect, it } from 'vitest';

import { getBackdropPosition } from './backdrop-focus';

describe('getBackdropPosition', () => {
  it('maps the normalized focus point to CSS percentages', () => {
    expect(getBackdropPosition({ x: 0.62, y: 0.223 })).toBe('62.00% 22.30%');
  });

  it('uses the right-centered fallback and clamps invalid bounds', () => {
    expect(getBackdropPosition(null)).toBe('100.00% 50.00%');
    expect(getBackdropPosition({ x: -1, y: 2 })).toBe('0.00% 100.00%');
  });

  it('positions the cover image so the focus reaches the safe backdrop point', () => {
    expect(
      getBackdropPosition(
        { x: 0.6, y: 0.5 },
        {
          imageWidth: 2400,
          imageHeight: 1000,
          containerWidth: 823,
          containerHeight: 508,
        }
      )
    ).toBe('66.23% 50.00%');
  });

  it('centers axes with no cover overflow', () => {
    expect(
      getBackdropPosition(
        { x: 0.1, y: 0.9 },
        {
          imageWidth: 823,
          imageHeight: 508,
          containerWidth: 823,
          containerHeight: 508,
        }
      )
    ).toBe('50.00% 50.00%');
  });
});
