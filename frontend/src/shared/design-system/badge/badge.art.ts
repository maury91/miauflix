import { hex, type Painter, remPx, type TextSpec } from '../gl/art';
import { color, radius, space, typeScale } from '../tokens';

const FILL = hex(color.canvas);
const BORDER = hex(color.borderControl);

/**
 * A neutral label Badge (badge.css.ts, `data-kind="label"`) with its top start corner at (x, y):
 * the opaque dark fill, the control border, uppercase caption text. Nothing until its text is ready.
 */
export function paintBadgeLabel(painter: Painter, label: string, x: number, y: number) {
  const spec: TextSpec = {
    text: label.toUpperCase(),
    size: remPx(typeScale.caption.fontSize),
    weight: 600,
    lineHeight: 1,
    color: color.text,
    maxWidth: remPx('20rem'),
  };
  const size = painter.measure(spec);
  if (!size) return;
  const padX = remPx(space.xs);
  const height = remPx('1.5rem');
  const width = size.width + padX * 2;
  const corner = remPx(radius.sm);
  painter.rect(x, y, width, height, FILL, { radius: corner });
  painter.rect(x, y, width, height, BORDER, { radius: corner, border: remPx('0.0625rem') });
  painter.text(spec, x + padX, y + height / 2, { anchorY: 0.5 });
}
