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

/**
 * Premium: gold on a dark gold fill, for a clean release's quality. The colours of the old quality
 * badge, made opaque over the canvas so it reads the same over artwork.
 */
export const badgePremium = {
  fill: '#261F0C',
  borderColor: '#AD8B22',
  textColor: '#FFE17A',
} as const;

export type BadgeTone = 'neutral' | 'premium' | 'info' | 'success' | 'warning' | 'danger';

/** A tone's border, text and fill colour. */
export function badgeToneColor(tone: BadgeTone) {
  if (tone === 'neutral')
    return { border: badgeLabel.borderColor, text: badgeLabel.textColor, fill: badgeLabel.fill };
  if (tone === 'premium')
    return {
      border: badgePremium.borderColor,
      text: badgePremium.textColor,
      fill: badgePremium.fill,
    };
  return { border: color[tone], text: color[tone], fill: badgeLabel.fill };
}
