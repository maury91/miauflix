import { describe, expect, it } from 'bun:test';

import {
  ARTWORK_BACKDROP_HEIGHT,
  ARTWORK_BACKDROP_WIDTH,
  measureLogoContrast,
} from '../src/services/artwork-contrast';

function canvas(color: [number, number, number]) {
  const rgba = new Uint8Array(ARTWORK_BACKDROP_WIDTH * ARTWORK_BACKDROP_HEIGHT * 4);
  const luminance = new Float32Array(ARTWORK_BACKDROP_WIDTH * ARTWORK_BACKDROP_HEIGHT);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = color[0];
    rgba[index + 1] = color[1];
    rgba[index + 2] = color[2];
    rgba[index + 3] = 255;
  }
  const channel = color[0] / 255;
  const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  luminance.fill(linear * 0.2126 + linear * 0.7152 + linear * 0.0722);
  return { rgba, luminance };
}

function logo(pixels: Array<{ color: [number, number, number]; alpha?: number }>) {
  const rgba = new Uint8Array(pixels.length * 4);
  pixels.forEach(({ color, alpha = 255 }, index) => {
    rgba.set([...color, alpha], index * 4);
  });
  return { rgba, width: pixels.length, height: 1 };
}

describe('logo contrast analysis', () => {
  it('accepts exactly 80% of visible area at 3:1 and rejects lower coverage', () => {
    const backdrop = canvas([0, 0, 0]);
    const thresholdLogo = logo([
      ...Array.from({ length: 8 }, () => ({ color: [255, 255, 255] as [number, number, number] })),
      ...Array.from({ length: 2 }, () => ({ color: [0, 0, 0] as [number, number, number] })),
    ]);
    const belowThresholdLogo = logo([
      ...Array.from({ length: 7 }, () => ({ color: [255, 255, 255] as [number, number, number] })),
      ...Array.from({ length: 3 }, () => ({ color: [0, 0, 0] as [number, number, number] })),
    ]);

    expect(
      measureLogoContrast(
        thresholdLogo.rgba,
        thresholdLogo.width,
        thresholdLogo.height,
        backdrop.rgba,
        backdrop.luminance,
        false
      )
    ).toMatchObject({ coverage: 0.8, passes: true });
    expect(
      measureLogoContrast(
        belowThresholdLogo.rgba,
        belowThresholdLogo.width,
        belowThresholdLogo.height,
        backdrop.rgba,
        backdrop.luminance,
        false
      ).passes
    ).toBe(false);
  });

  it('ignores pixels below 0.5 alpha and weights remaining partial transparency', () => {
    const backdrop = canvas([0, 0, 0]);
    const belowCutoff = logo([
      { color: [255, 255, 255], alpha: 255 },
      { color: [0, 0, 0], alpha: 127 },
    ]);
    const atCutoff = logo([
      { color: [255, 255, 255], alpha: 255 },
      { color: [0, 0, 0], alpha: 128 },
    ]);

    expect(
      measureLogoContrast(
        belowCutoff.rgba,
        belowCutoff.width,
        belowCutoff.height,
        backdrop.rgba,
        backdrop.luminance,
        true
      )
    ).toMatchObject({ coverage: 1, passes: true });
    expect(
      measureLogoContrast(
        atCutoff.rgba,
        atCutoff.width,
        atCutoff.height,
        backdrop.rgba,
        backdrop.luminance,
        true
      ).coverage
    ).toBeCloseTo(255 / 383, 5);
  });

  it('selects independently against the backdrop and the black hero background', () => {
    const backdrop = canvas([255, 255, 255]);
    const whiteLogo = logo([{ color: [255, 255, 255] }]);
    const againstCard = measureLogoContrast(
      whiteLogo.rgba,
      whiteLogo.width,
      whiteLogo.height,
      backdrop.rgba,
      backdrop.luminance,
      false
    );
    const againstHero = measureLogoContrast(
      whiteLogo.rgba,
      whiteLogo.width,
      whiteLogo.height,
      backdrop.rgba,
      backdrop.luminance,
      true
    );

    expect(againstCard.passes).toBe(false);
    expect(againstHero.passes).toBe(true);
  });
});
