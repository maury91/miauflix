import { color, radius, space, typeScale } from '../tokens';

/**
 * A label Badge's numbers (quality, availability), shared by its CSS (badge.css.ts) and its
 * picture (badge.art.ts). Lengths are token strings (rem); the picture converts them to px.
 */
export const badgeLabel = {
  height: '1.5rem',
  paddingX: space.xs,
  border: '0.0625rem',
  radius: radius.sm,
  fontSize: typeScale.caption.fontSize,
  fontWeight: 600,
  fill: color.canvas,
  /** Neutral: the border and text; a tone colours both. */
  borderColor: color.borderControl,
  textColor: color.text,
} as const;

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A tone's border and text colour. */
export function badgeToneColor(tone: BadgeTone) {
  return tone === 'neutral'
    ? { border: badgeLabel.borderColor, text: badgeLabel.textColor }
    : { border: color[tone], text: color[tone] };
}
