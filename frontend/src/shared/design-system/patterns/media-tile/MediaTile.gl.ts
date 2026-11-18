import { drawArtwork } from '../../artwork/Artwork.gl';
import { collectionTileArt, type TileVisualGl } from '../../collection-tile/CollectionTile.gl';
import type { GlArt } from '../../gl';
import type { MediaTileProps } from './MediaTile';

/** The logo's box in the frame (mediaTile.css.ts `logo`, CARD_IMAGE_LOGO_BOX). */
export const LOGO_BOX = { left: 0.05, top: 0.18, width: 0.64, height: 0.48 };

type MediaTileVisualProps = Pick<
  MediaTileProps,
  'title' | 'artwork' | 'ratio' | 'logo' | 'titledArtwork'
>;

/**
 * MediaTile's visual in GL, with MediaTile's fallbacks: the titled backdrop; failing (or absent),
 * the artwork with the logo over it; the logo failing, the tile shows its label; no artwork, the
 * title in the frame. As in the DOM tile, a titled backdrop names the tile only once it is in (the
 * label shows while it loads); a loading logo counts as shown.
 */
export function mediaTileVisual({
  title,
  artwork,
  ratio = 'landscape',
  logo,
  titledArtwork,
}: MediaTileVisualProps): TileVisualGl {
  const landscape = ratio === 'landscape';
  return {
    key: `media|${landscape ? (titledArtwork ?? '') : ''}|${artwork ?? ''}|${landscape ? (logo ?? '') : ''}|${title}`,
    draw(painter, { width, height }) {
      if (landscape && titledArtwork) {
        const status = painter.image(titledArtwork, 0, 0, width, height, { fit: 'cover' });
        if (status === 'ready') return { namesTile: true };
        if (status === 'loading') return { namesTile: false };
      }
      drawArtwork(painter, { src: artwork, width, height, fallbackText: title });
      if (landscape && logo) {
        const status = painter.image(
          logo,
          width * LOGO_BOX.left,
          height * LOGO_BOX.top,
          width * LOGO_BOX.width,
          height * LOGO_BOX.height,
          { fit: 'contain', alignX: 0, alignY: 1 }
        );
        if (status !== 'failed') return { namesTile: true };
      }
      return { namesTile: false };
    },
  };
}

/** The whole tile as one picture (CollectionTile.gl.ts around the visual), `width` px wide. */
export function mediaTileArt(props: MediaTileProps, width: number): GlArt {
  return collectionTileArt(
    {
      label: props.title,
      supportingText: props.supportingText,
      ratio: props.ratio,
      labelPlacement: props.labelPlacement,
      progress: props.progress,
      width,
    },
    mediaTileVisual(props)
  );
}
