import type { ReactNode } from 'react';

import * as styles from './artwork.css';
import { useImageStatus } from './useImageStatus';

export interface ArtworkProps {
  /** The image URL. Absent or failing, the fallback shows in the same box. */
  src?: string | null;
  /**
   * The image's text alternative. Empty (the default) when a label next to it already names the
   * content, as in a tile; a description from the feature otherwise.
   */
  alt?: string;
  /** 16:9, 2:3, 1:1, or `fill` to cover a positioned container (a tile's frame, a hero). */
  ratio?: 'landscape' | 'portrait' | 'square' | 'fill';
  /** `cover` crops to the box; `contain` letterboxes (logos, profile pictures). */
  fit?: 'cover' | 'contain';
  /** Shown when there is no image or it fails: a title, an icon. Decorative. */
  fallback?: ReactNode;
}

/**
 * An image whose geometry never depends on it: the box keeps its ratio while loading (placeholder
 * fill), once loaded (the image fades in) and on failure (the fallback). Passive, never focusable.
 */
export function Artwork({
  src,
  alt = '',
  ratio = 'landscape',
  fit = 'cover',
  fallback,
}: ArtworkProps) {
  const { status, imageProps } = useImageStatus(src);
  return (
    <span className={styles.artwork} data-ratio={ratio} data-fit={fit} data-status={status}>
      {src && status !== 'failed' && (
        <img
          {...imageProps}
          key={src}
          className={styles.image}
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
        />
      )}
      {status === 'failed' && fallback && (
        <span className={styles.fallback} aria-hidden="true">
          {fallback}
        </span>
      )}
    </span>
  );
}
