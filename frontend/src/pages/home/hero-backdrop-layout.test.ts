import { describe, expect, it } from 'vitest';

import { getBackdropPlacement } from './backdrop-focus';
import { getHeroBackdropLayout } from './hero-backdrop-layout';

const focus = { x: 0.5009114583333333, y: 0.26180555555555557 };

// Reconstruct CSS background-position: percentages multiply the available overflow.
function renderedFocus(width: number, height: number, point = focus) {
  const layout = getHeroBackdropLayout(width)!;
  const placement = getBackdropPlacement(point, {
    imageWidth: 3840,
    imageHeight: 2160,
    containerWidth: layout.width,
    containerHeight: height * 0.55,
    targetX: layout.targetX,
    targetY: layout.targetY,
    maxZoom: 1.5,
  });
  const [rw, rh] = placement.size.split(' ').map(parseFloat);
  const [px, py] = placement.position.split(' ').map(value => parseFloat(value) / 100);
  return {
    layout,
    rw,
    rh,
    x: layout.left + point.x * rw! + (layout.width - rw!) * px!,
    y: point.y * rh! + (height * 0.55 - rh!) * py!,
  };
}

describe('hero backdrop framing', () => {
  it('matches the marked spot at the screenshot proportions', () => {
    const result = renderedFocus(1465, 710);
    expect(result.x / 1465).toBeCloseTo(0.7795, 4);
    expect(result.y / 710).toBeCloseTo(0.198, 4);
    expect(result.layout.left).toBeCloseTo(1465 * 0.32);
  });

  it.each([
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
    [3440, 1440],
  ])('reaches the target without exposing edges at %sx%s', (width, height) => {
    const result = renderedFocus(width, height);
    expect(result.x).toBeCloseTo(
      result.layout.left + result.layout.width * result.layout.targetX,
      1
    );
    expect(Math.abs(result.y - height * 0.55 * result.layout.targetY)).toBeLessThan(0.2);
    expect(result.rw).toBeGreaterThanOrEqual(result.layout.width);
    expect(result.rh).toBeGreaterThanOrEqual(height * 0.55);
    const coverWidth = Math.max(result.layout.width, (height * 0.55 * 16) / 9);
    expect(result.rw).toBeLessThanOrEqual(coverWidth * 1.5 + 0.001);
  });

  it('accounts for the 720px text cap instead of leaving the backdrop at 32vw', () => {
    const layout = getHeroBackdropLayout(3840)!;
    const textRight = 3840 * 0.07 + 720;
    expect(layout.left).toBeCloseTo(3840 * 0.07 + (720 * 25) / 44);
    expect(layout.left).toBeLessThan(3840 * 0.32);
    const screenX = layout.left + layout.width * layout.targetX;
    expect(screenX).toBeCloseTo(textRight + (3840 - textRight) * 0.55);
    expect(screenX / 3840).toBeCloseTo(0.665875);
  });

  it('bounds zoom and keeps finite placement for an edge focus', () => {
    const result = renderedFocus(1920, 1080, { x: 0, y: 1 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(result.rw).toBeCloseTo(Math.max(result.layout.width, (594 * 16) / 9) * 1.5);
  });

  it('handles coincident focus and target edges without a division by zero', () => {
    const placement = getBackdropPlacement(
      { x: 0, y: 0.1 },
      {
        imageWidth: 1000,
        imageHeight: 1000,
        containerWidth: 1000,
        containerHeight: 1000,
        targetX: 0,
        targetY: 0.15,
        maxZoom: 1.5,
      }
    );
    expect(placement.size).toBe('1500px 1500px');
    expect(placement.position).toBe('0.00% 0.00%');
  });

  it('preserves missing-focus and unmeasured-container fallbacks', () => {
    expect(getHeroBackdropLayout(0)).toBeNull();
    expect(getHeroBackdropLayout(NaN)).toBeNull();
    expect(getBackdropPlacement(null)).toEqual({ position: '100.00% 50.00%', size: 'cover' });
    expect(getBackdropPlacement(focus)).toEqual({ position: '50.09% 26.18%', size: 'cover' });
  });
});
