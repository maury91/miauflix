import { drawArtwork } from '../../artwork/artwork.art';
import type { TileVisualArt } from '../../collection-tile/collectionTile.art';
import { artKey, type Painter } from '../../gl/art';
import { LOGO_BOX } from './mediaTile.metrics';
import { type MediaTileVisualProps, resolveMediaTileVisual } from './mediaTileVisual';

/** The title logo in a frame of `width` × `height`. */
export function drawTileLogo(painter: Painter, src: string, width: number, height: number) {
  return painter.image(
    src,
    width * LOGO_BOX.left,
    height * LOGO_BOX.top,
    width * LOGO_BOX.width,
    height * LOGO_BOX.height,
    { fit: 'contain', alignX: 0, alignY: 1 }
  );
}

/** MediaTile's visual in the tile's picture, with its fallbacks (resolveMediaTileVisual). */
export function mediaTileVisual(props: MediaTileVisualProps): TileVisualArt {
  const { title, artwork, ratio, logo, titledArtwork } = props;
  return {
    key: artKey('media', { title, artwork, ratio, logo, titledArtwork }),
    // A titled backdrop's newer revision keeps the last one in view while it bakes (holdPrevious
    // in the DOM tile); another title (a reused slot) doesn't
    holdKey: titledArtwork ? artKey('media-hold', { title, ratio }) : undefined,
    draw(painter, { width, height }) {
      const visual = resolveMediaTileVisual(props, src =>
        painter.load(src, src === logo ? width * LOGO_BOX.width : width)
      );
      if (visual.titled) {
        painter.image(visual.titled, 0, 0, width, height, { fit: 'cover' });
        return { namesTile: visual.namesTile };
      }
      drawArtwork(painter, { src: visual.artwork, width, height, fallbackText: title });
      if (visual.logo) drawTileLogo(painter, visual.logo, width, height);
      return { namesTile: visual.namesTile };
    },
  };
}
