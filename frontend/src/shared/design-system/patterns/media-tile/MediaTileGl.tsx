import { forwardRef } from 'react';

import { Badge } from '../../badge/Badge';
import { CollectionTileGl } from '../../collection-tile/CollectionTileGl';
import type { MediaTileProps } from './MediaTile';
import { mediaTileVisual } from './mediaTile.art';

/**
 * MediaTile drawn by the GlSurface: the whole tile is one baked picture (mediaTile.art.ts), whose
 * visual decides from the images' statuses whether it names the tile.
 */
export const MediaTileGl = forwardRef<HTMLButtonElement, MediaTileProps>(function MediaTileGl(
  { title, artwork, ratio = 'landscape', logo, titledArtwork, badge, ...props },
  forwardedRef
) {
  return (
    <CollectionTileGl
      {...props}
      ref={forwardedRef}
      label={title}
      ratio={ratio}
      glVisual={mediaTileVisual({ title, artwork, ratio, logo, titledArtwork })}
      glBadge={badge ? { text: badge.label } : undefined}
      badge={
        badge ? <Badge accessibleLabel={badge.accessibleLabel}>{badge.label}</Badge> : undefined
      }
    />
  );
});
