import { type ReactNode, useLayoutEffect, useMemo } from 'react';

import { useGlLayer, useGlNode, useGlPaint } from '../gl';
import { paintFocusRing } from './collectionTile.art';
import { type FocusAnchor, FocusAnchorContext } from './focusAnchor';

export interface GlFocusAnchorProps {
  /** The surface layer the outline is drawn in (GlLayer `name`): over the content, never scrolled. */
  layer: string;
  /** The focused frame's resting box, in canvas px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The focused tile's scale (about its centre). */
  scale?: number;
  children: ReactNode;
}

/**
 * Inside a GlSurface: one focus outline that never moves, over everything. For collections whose
 * movement is fully controlled (Home: rows slide so the focused tile always rests in the same
 * place), so the tile lands behind it. Shown while a tile under it is focused.
 */
export function GlFocusAnchor({
  layer,
  x,
  y,
  width,
  height,
  scale = 1,
  children,
}: GlFocusAnchorProps) {
  const node = useGlNode(useGlLayer(layer));
  const anchor = useMemo<FocusAnchor>(() => {
    const holders = new Set<string>();
    return {
      set(id, focused) {
        if (focused) holders.add(id);
        else holders.delete(id);
        node?.set({ opacity: holders.size ? 1 : 0 });
      },
    };
  }, [node]);
  useLayoutEffect(() => {
    node?.set({ x, y, width, height, scale });
  });
  useLayoutEffect(() => {
    node?.set({ opacity: 0 });
  }, [node]);
  useGlPaint(node, painter => paintFocusRing(painter, width, height), [width, height]);
  return <FocusAnchorContext.Provider value={anchor}>{children}</FocusAnchorContext.Provider>;
}
