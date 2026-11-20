import { forwardRef } from 'react';

import type { CollectionTileProps } from '../../collection-tile/CollectionTile';
import { useRenderMode } from '../../gl';
import { MediaTileDom } from './MediaTileDom';
import { MediaTileGl } from './MediaTileGl';

export type MediaTileProps = Omit<
  CollectionTileProps,
  'label' | 'labelHidden' | 'visual' | 'ratio' | 'badge'
> & {
  /** The title, which names the tile. From the feature, already localized. */
  title: string;
  /** Backdrop (landscape) or poster (portrait) URL. Missing or failing, the title shows instead. */
  artwork?: string | null;
  /** `landscape` backdrops (Home rows) or `portrait` posters. */
  ratio?: 'landscape' | 'portrait';
  /**
   * The title's logo, drawn over a landscape backdrop. Decorative: the title names the tile, and
   * over the artwork (`labelPlacement="overlay"`) the logo stands in for the visible title.
   */
  logo?: string | null;
  /**
   * A landscape backdrop with the title already drawn in (the logo, or the name): preferred over
   * `artwork` and `logo`, since one image paints faster than two layers. Over the artwork it stands
   * in for the visible title, once it has shown: until then the title stays visible, and a newer
   * version keeps the previous one in view while it loads. If it fails to load, the tile shows
   * `artwork` and `logo` instead.
   */
  titledArtwork?: string | null;
  /** A short quality or availability label ("4K", "New"), top start corner. */
  badge?: { label: string; accessibleLabel?: string };
};

/**
 * A movie or show in a collection: Home rows, Search results, related media. The same tile
 * everywhere; features adapt their media data into these props (formatted text, image URLs), and
 * the collection around it owns movement. Supporting text, progress and the badge describe it.
 * Drawn by the GlSurface it's in as one picture (MediaTileGl), or as DOM (MediaTileDom).
 */
export const MediaTile = forwardRef<HTMLButtonElement, MediaTileProps>(
  function MediaTile(props, ref) {
    return useRenderMode() === 'gl' ? (
      <MediaTileGl {...props} ref={ref} />
    ) : (
      <MediaTileDom {...props} ref={ref} />
    );
  }
);
