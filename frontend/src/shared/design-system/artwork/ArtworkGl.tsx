import { useLayoutEffect } from 'react';

import { remPx, useGlImageStatus, useGlNode, useGlPaint, useGlParent } from '../gl';
import type { ArtworkProps } from './Artwork';
import { drawArtwork } from './artwork.art';
import { ARTWORK_RATIO, artworkRadius } from './artwork.metrics';
import { useArtwork } from './useArtwork';

/**
 * Artwork drawn by the GlSurface (artwork.art.ts): the renderer loads the image and its status
 * drives the fallback. A described image leaves an element for the reader.
 */
export function ArtworkGl(props: ArtworkProps) {
  const { src, alt = '', ratio = 'landscape', fit = 'cover', fallbackText } = props;
  const parent = useGlParent();
  const node = useGlNode();
  const status = useGlImageStatus(src);
  const failed = !src || status === 'failed';
  const { held } = useArtwork(props, {
    failed,
    loaded: Boolean(src) && status === 'ready',
  });
  const width = parent?.width ?? 0;
  const height = ratio === 'fill' ? (parent?.height ?? 0) : width * ARTWORK_RATIO[ratio];
  const corner = ratio === 'fill' ? (parent?.radius ?? 0) : remPx(artworkRadius);
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
    [src, held, failed, width, height, corner, fit, fallbackText]
  );
  return alt ? <span role="img" aria-label={alt} /> : null;
}
