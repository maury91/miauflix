import { forwardRef, useLayoutEffect, useMemo } from 'react';

import { GlParentProvider, remPx, useGlNode, useGlPaint, useGlParent, useGlTarget } from '../gl';
import { useMergedRef } from '../navFocus';
import type { CollectionTileProps } from './CollectionTile';
import {
  collectionTileArt,
  paintFocusRing,
  paintTileFrame,
  paintTileOverlay,
} from './collectionTile.art';
import * as styles from './collectionTile.css';
import { TILE_RATIO, tileMetrics } from './collectionTile.metrics';
import { useFocusAnchor } from './focusAnchor';
import { useCollectionTile } from './useCollectionTile';

/**
 * CollectionTile drawn by the GlSurface: the frame, scrim, progress, text and focus outline are
 * drawn by the renderer; the button stays, unpositioned, for focus, the reader (its name and
 * description as text) and the pointer (the surface forwards moves and clicks over the tile). With
 * `glVisual` the tile is one baked picture (collectionTile.art.ts, with `glBadge`) and only the
 * outline is live; otherwise the visual registers its own nodes in the frame.
 */
export const CollectionTileGl = forwardRef<HTMLButtonElement, CollectionTileProps>(
  function CollectionTileGl(props, forwardedRef) {
    const {
      label,
      supportingText,
      visual,
      ratio = 'landscape',
      labelPlacement = 'below',
      labelHidden = false,
      badge,
      progress,
      progressText,
      glVisual,
      glBadge,
      disabled,
    } = props;
    const { id, active, buttonProps } = useCollectionTile(props, forwardedRef);
    const parent = useGlParent();
    const tileNode = useGlNode();
    // The pointer over the drawn tile goes to the button
    const ref = useMergedRef(buttonProps.ref, useGlTarget(tileNode));
    const visualNode = useGlNode(tileNode);
    const overlayNode = useGlNode(tileNode);
    const tileWidth = parent?.width ?? 0;
    const frameHeight = tileWidth * TILE_RATIO[ratio];
    // Under a GlFocusAnchor the outline is drawn once, where the focused tile rests
    const anchor = useFocusAnchor();
    useLayoutEffect(() => {
      if (!anchor) return;
      anchor.set(id, active);
      return () => anchor.set(id, false);
    }, [anchor, active, id]);
    useLayoutEffect(() => {
      if (!tileNode || !overlayNode) return;
      tileNode.set({
        width: tileWidth,
        height: frameHeight,
        // On the TV the focus scale applies at once (collectionTile.css.ts)
        scale: active ? tileMetrics.focusScale : 1,
        opacity: disabled ? tileMetrics.disabledOpacity : 1,
      });
      overlayNode.set({ z: 1 });
    });
    const art = glVisual
      ? collectionTileArt(
          {
            label,
            supportingText,
            ratio,
            labelPlacement,
            labelHidden,
            progress,
            badge: glBadge,
            width: tileWidth,
          },
          glVisual
        )
      : null;
    useGlPaint(
      tileNode,
      painter => {
        if (art) painter.art(art);
        else paintTileFrame(painter, tileWidth, frameHeight);
      },
      [art?.key, tileWidth, frameHeight]
    );
    useGlPaint(
      overlayNode,
      painter => {
        if (!art)
          paintTileOverlay(painter, {
            width: tileWidth,
            height: frameHeight,
            label: labelHidden ? undefined : label,
            supportingText,
            labelPlacement,
            progress,
          });
        if (active && !anchor) paintFocusRing(painter, tileWidth, frameHeight);
      },
      [
        anchor,
        art?.key,
        tileWidth,
        frameHeight,
        labelHidden,
        label,
        supportingText,
        labelPlacement,
        progress,
        active,
      ]
    );
    const visualValue = useMemo(
      () =>
        parent && visualNode
          ? {
              renderer: parent.renderer,
              node: visualNode,
              width: tileWidth,
              height: frameHeight,
              radius: remPx(tileMetrics.radius),
            }
          : null,
      [frameHeight, parent, tileWidth, visualNode]
    );
    return (
      <button {...buttonProps} ref={ref} className={styles.glTile}>
        <span id={`${id}-label`}>{label}</span>
        {supportingText && <span id={`${id}-supporting`}>{supportingText}</span>}
        {badge && <span id={`${id}-badge`}>{badge}</span>}
        {progressText && <span id={`${id}-progress`}>{progressText}</span>}
        {!art && visualValue && <GlParentProvider value={visualValue}>{visual}</GlParentProvider>}
      </button>
    );
  }
);
