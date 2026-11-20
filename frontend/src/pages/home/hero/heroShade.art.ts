import type { Painter } from '@shared/design-system/gl/art';

import { getHeroBackdropLayout, type getHeroTextGeometry } from '../hero-backdrop-layout';
import { HERO_SHADE } from './heroShade.metrics';

type TextGeometry = ReturnType<typeof getHeroTextGeometry>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The shade drawn with canvas 2D at half resolution (one texture per size). */
export function paintHeroShade(
  painter: Painter,
  width: number,
  height: number,
  windowHeight: number,
  shade: TextGeometry
) {
  const scale = 0.5;
  const key = `hero-shade-v2:${Math.round(width)}x${Math.round(height)}:${Math.round(shade.detailsLeft)}`;
  painter.canvas(
    key,
    width * scale,
    height * scale,
    context => {
      context.scale(scale, scale);
      const at = (fromFree: number) => shade.textRight + fromFree * shade.freeWidth;
      // Painted bottom up: CSS lists the top layer first
      const bottom = context.createLinearGradient(0, height, 0, 0);
      for (const [stop, fill] of HERO_SHADE.bottom) bottom.addColorStop(stop, fill);
      context.fillStyle = bottom;
      context.fillRect(0, 0, width, height);
      const { side } = HERO_SHADE;
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, side.color);
      // Opaque up to the backdrop's left edge (it starts under the details), then fading: its
      // edge never shows
      const backdropLeft = getHeroBackdropLayout(width, shade.detailsLeft)?.left ?? 0;
      gradient.addColorStop(clamp01(backdropLeft / width), side.color);
      gradient.addColorStop(
        clamp01((backdropLeft + shade.detailsWidth * side.edgeFade) / width),
        side.edgeFadeColor
      );
      gradient.addColorStop(clamp01(at(side.midFree) / width), side.midColor);
      gradient.addColorStop(clamp01(at(side.endFree) / width), 'rgba(3,5,13,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const { radial } = HERO_SHADE;
      const rx = width * radial.radiusX;
      const ry = height * radial.radiusY;
      context.save();
      context.translate(at(radial.centerFree), 0);
      context.scale(rx / ry, 1);
      const ellipse = context.createRadialGradient(0, 0, 0, 0, 0, ry);
      for (const [stop, fill] of radial.stops) ellipse.addColorStop(stop, fill);
      context.fillStyle = ellipse;
      context.fillRect(-width * 4, -height, width * 8, height * 4);
      context.restore();
      const { band } = HERO_SHADE;
      const top = (windowHeight * band.topVh) / 100;
      const bandHeight = (windowHeight * band.heightVh) / 100;
      const after = context.createLinearGradient(0, top, 0, top + bandHeight);
      for (const [stop, fill] of band.stops) after.addColorStop(stop, fill);
      context.fillStyle = after;
      const left = at(band.leftFree);
      context.fillRect(left, top, width - left, bandHeight);
    },
    0,
    0,
    width,
    height
  );
}
