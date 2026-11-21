import { hex, type Painter, remPx } from '../gl/art';
import { badgeLabel, type BadgeTone, badgeToneColor } from './badge.metrics';

export interface BadgeArtProps {
  /** The visible text, as Badge's children (drawn uppercase). */
  text: string;
  tone?: BadgeTone;
}

/**
 * A label Badge drawn at (`x`, `y`), its top left: the opaque fill, the tone's border and the
 * uppercase text centred. Returns its size, or null until its text is ready (nothing drawn).
 */
export function paintBadge(
  painter: Painter,
  { text, tone = 'neutral' }: BadgeArtProps,
  x: number,
  y: number
): { width: number; height: number } | null {
  const colors = badgeToneColor(tone);
  const spec = {
    text: text.toUpperCase(),
    size: remPx(badgeLabel.fontSize),
    weight: badgeLabel.fontWeight,
    lineHeight: 1,
    color: colors.text,
    maxWidth: 1000,
  };
  const label = painter.measure(spec);
  if (!label) return null;
  const height = remPx(badgeLabel.height);
  const border = remPx(badgeLabel.border);
  const corner = remPx(badgeLabel.radius);
  // As the DOM badge: the padding inside the borders
  const width = label.width + remPx(badgeLabel.paddingX) * 2 + border * 2;
  painter.rect(x, y, width, height, hex(colors.border), { radius: corner });
  painter.rect(x + border, y + border, width - border * 2, height - border * 2, hex(colors.fill), {
    radius: Math.max(0, corner - border),
  });
  painter.text(spec, x + width / 2, y + height / 2, { anchorX: 0.5, anchorY: 0.5 });
  return { width, height };
}
