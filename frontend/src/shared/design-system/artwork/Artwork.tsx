import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';

import { remPx, useGlImageStatus, useGlNode, useGlPaint, useGlParent } from '../gl';
import { radius } from '../tokens';
import { drawArtwork } from './artwork.art';
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
  /** Called once `src` fails to load (not when it is absent). */
  onError?: () => void;
  /** Called once `src` has loaded. */
  onLoad?: () => void;
  /**
   * While a new `src` loads, keep showing the last one that loaded instead of the placeholder (a
   * newer version of the same picture), then show the new one without fading in. Off by default.
   */
  holdPrevious?: boolean;
  /** Inside a GlSurface (spike), the fallback drawn as text: GL can't draw `fallback`. */
  fallbackText?: string;
}

const RATIO = { landscape: 9 / 16, portrait: 3 / 2, square: 1 } as const;

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
  onError,
  onLoad,
  holdPrevious = false,
  fallbackText,
}: ArtworkProps) {
  const { status: domStatus, imageProps } = useImageStatus(src);
  // GL form: the renderer loads and draws the image; its status drives the fallback
  const glParent = useGlParent();
  const node = useGlNode();
  const glStatus = useGlImageStatus(src);
  const status = glParent ? (!src || glStatus === 'failed' ? 'failed' : 'loading') : domStatus;
  const failed = Boolean(src) && status === 'failed';
  // In the GL form the renderer knows when the image is in
  const loaded = Boolean(src) && (glParent ? glStatus === 'ready' : status === 'loaded');
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);
  const loading = Boolean(src) && !loaded && status !== 'failed';
  // A newer picture replacing one that loaded before: the old one stays in view until the new one
  // has loaded, which then shows at once (fading in would uncover the box under both)
  const replacing = holdPrevious && lastLoaded !== null && lastLoaded !== src;
  const held = replacing && loading ? lastLoaded : null;
  const width = glParent?.width ?? 0;
  const height = ratio === 'fill' ? (glParent?.height ?? 0) : width * RATIO[ratio];
  const corner = ratio === 'fill' ? (glParent?.radius ?? 0) : glParent ? remPx(radius.md) : 0;
  useLayoutEffect(() => {
    node?.set({ width, height });
  });
  useGlPaint(
    node,
    painter => {
      drawArtwork(painter, {
        src,
        previous: held,
        width,
        height,
        fit,
        radius: corner,
        fallbackText,
      });
    },
    [src, held, status, width, height, corner, fit, fallbackText]
  );
  useEffect(() => {
    if (failed) onError?.();
    // Once per failing source; a new callback for the same failure is not a new failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, src]);
  useEffect(() => {
    if (!loaded || !src) return;
    setLastLoaded(src);
    onLoad?.();
    // Once per loaded source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, src]);
  // A described image keeps its description when the picture is missing or fails
  const describedFallback = status === 'failed' && alt !== '';
  if (glParent) {
    // The canvas is hidden from assistive technology: a described image keeps its description
    return alt ? <span role="img" aria-label={alt} /> : null;
  }
  return (
    <span
      className={styles.artwork}
      data-ratio={ratio}
      data-fit={fit}
      data-status={status}
      role={describedFallback ? 'img' : undefined}
      aria-label={describedFallback ? alt : undefined}
    >
      {held && (
        <img
          key={held}
          className={styles.heldImage}
          src={held}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      {src && status !== 'failed' && (
        <img
          {...imageProps}
          key={src}
          className={styles.image}
          data-instant={replacing ? '' : undefined}
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
