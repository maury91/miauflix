import type { Painter } from '../gl/art';

/**
 * The spinner's ring at (`x`, `y`), `size` px square: a faint full circle and a quarter arc in
 * `color`, as the DOM's two-tone icon. Static: the node it's drawn in turns (GlNode.spin). Drawn
 * once with canvas 2D at twice its size, so it stays smooth as it turns. False until ready.
 */
export function paintSpinner(painter: Painter, size: number, color: string, x = 0, y = 0) {
  const px = Math.ceil(size * 2);
  return painter.canvas(
    `spinner|${px}|${color}`,
    px,
    px,
    context => {
      // As the 24 px icon: a 2 px line on a 9 px radius
      const line = (px * 2) / 24;
      const radius = (px * 9) / 24;
      context.lineWidth = line;
      context.lineCap = 'round';
      context.strokeStyle = color;
      context.globalAlpha = 0.3;
      context.beginPath();
      context.arc(px / 2, px / 2, radius, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(px / 2, px / 2, radius, -Math.PI / 2, 0);
      context.stroke();
    },
    x,
    y,
    size,
    size
  );
}
