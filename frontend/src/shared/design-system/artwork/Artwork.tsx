import type { ReactNode } from 'react';

import { useRenderMode } from '../gl';
import { ArtworkDom } from './ArtworkDom';
import { ArtworkGl } from './ArtworkGl';

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
  /** Inside a GlSurface, the fallback drawn as text: GL can't draw `fallback`. */
  fallbackText?: string;
}

/**
 * An image whose geometry never depends on it: the box keeps its ratio while loading (placeholder
 * fill), once loaded (the image fades in) and on failure (the fallback). Passive, never focusable.
 * Drawn by the GlSurface it's in (ArtworkGl), or as DOM (ArtworkDom).
 */
export function Artwork(props: ArtworkProps) {
  return useRenderMode() === 'gl' ? <ArtworkGl {...props} /> : <ArtworkDom {...props} />;
}
