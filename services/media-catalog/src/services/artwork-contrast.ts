export const ARTWORK_BACKDROP_WIDTH = 320;
export const ARTWORK_BACKDROP_HEIGHT = 180;
export const ARTWORK_TARGET_COVERAGE = 0.8;

export function relativeLuminance(rgb: readonly number[]): number {
  const linear = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

/** Measure contrast for the centered logo against the card backdrop or a solid black hero. */
export function measureLogoContrast(
  logo: Uint8Array,
  logoWidth: number,
  logoHeight: number,
  backdrop: Uint8Array,
  backdropLuminance: Float32Array,
  againstBlack: boolean
) {
  const ratios: Array<{ ratio: number; alpha: number }> = [];
  const left = Math.round((ARTWORK_BACKDROP_WIDTH - logoWidth) / 2);
  const top = Math.round((ARTWORK_BACKDROP_HEIGHT - logoHeight) / 2);
  let total = 0;
  let passing = 0;
  for (let y = 0; y < logoHeight; y++) {
    for (let x = 0; x < logoWidth; x++) {
      const foregroundIndex = (y * logoWidth + x) * 4;
      const alpha = logo[foregroundIndex + 3]! / 255;
      if (alpha < 0.5) continue;
      const backdropIndex = ((top + y) * ARTWORK_BACKDROP_WIDTH + left + x) * 4;
      const background = againstBlack
        ? [0, 0, 0]
        : [backdrop[backdropIndex]!, backdrop[backdropIndex + 1]!, backdrop[backdropIndex + 2]!];
      const composite = [0, 1, 2].map(
        channel => logo[foregroundIndex + channel]! * alpha + background[channel]! * (1 - alpha)
      );
      const foregroundLuminance = relativeLuminance(composite);
      const backgroundLuminance = againstBlack
        ? 0
        : backdropLuminance[(top + y) * ARTWORK_BACKDROP_WIDTH + left + x]!;
      const ratio =
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      ratios.push({ ratio, alpha });
      total += alpha;
      if (ratio >= 3) passing += alpha;
    }
  }
  const coverage = total ? passing / total : 0;
  ratios.sort((a, b) => a.ratio - b.ratio);
  let cumulative = 0;
  let median = 0;
  for (const entry of ratios) {
    cumulative += entry.alpha;
    if (cumulative >= total / 2) {
      median = entry.ratio;
      break;
    }
  }
  return { coverage, median, passes: coverage >= ARTWORK_TARGET_COVERAGE };
}
