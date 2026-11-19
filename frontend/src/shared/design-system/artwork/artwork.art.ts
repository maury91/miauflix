import { type ImageStatus, type Painter, remPx } from '../gl/art';
import { color } from '../tokens';
import { artworkFallback } from './artwork.metrics';

export interface ArtworkArtProps {
  src?: string | null;
  /** Drawn under `src` while it loads: the version it replaces (Artwork's `holdPrevious`). */
  previous?: string | null;
  /** The box (px), from (0, 0). */
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  /** Rounded corners (live drawing only: a baked picture rounds its corners itself). */
  radius?: number;
  /** Drawn in the box when there's no image or it fails. */
  fallbackText?: string;
}

/**
 * Artwork's picture: the image, or its fallback text once it fails. Returns the image's status
 * (`failed` without one), so a caller can fall back further.
 */
export function drawArtwork(
  painter: Painter,
  { src, previous, width, height, fit = 'cover', radius = 0, fallbackText }: ArtworkArtProps
): ImageStatus {
  // An image still loading draws nothing, so the previous one shows until it covers it
  if (previous) painter.image(previous, 0, 0, width, height, { radius, fit });
  const status = src ? painter.image(src, 0, 0, width, height, { radius, fit }) : 'failed';
  if (status !== 'failed' || !fallbackText) return status;
  const padding = remPx(artworkFallback.padding);
  const type = artworkFallback.type;
  painter.text(
    {
      text: fallbackText,
      size: remPx(type.fontSize),
      weight: type.fontWeight,
      lineHeight: parseFloat(type.lineHeight),
      color: color.textSecondary,
      maxWidth: width - padding * 2,
      maxLines: artworkFallback.maxLines,
      align: 'center',
    },
    width / 2,
    height / 2,
    { anchorX: 0.5, anchorY: 0.5 }
  );
  return status;
}
