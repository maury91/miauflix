import { type ReactNode, useLayoutEffect, useState } from 'react';

import { GlNode } from '../core/scene';
import { GlParentScope } from './GlGroup';
import { useGlLayers, useGlParent } from './hooks';

export interface GlLayerProps {
  /**
   * Names the layer, so components elsewhere draw into it (`useGlLayer`): a hero's backdrops under
   * the rows while its React tree sits with the rest of the hero.
   */
  name?: string;
  /** Order among its siblings (higher on top). */
  z?: number;
  /**
   * Drawn as one picture, re-rendered into a texture whenever something in it changes: for
   * layers that change rarely and are costly to draw every frame. Animate what's under or over it
   * in live layers instead.
   */
  baked?: boolean;
  x?: number;
  y?: number;
  /** The box (defaults to the parent's). */
  width?: number;
  height?: number;
  clip?: boolean;
  children?: ReactNode;
}

/** A layer of the surface: a node in its parent, live or baked. */
export function GlLayer({
  name,
  z = 0,
  baked = false,
  x = 0,
  y = 0,
  width,
  height,
  clip = false,
  children,
}: GlLayerProps) {
  const parent = useGlParent();
  const layers = useGlLayers();
  const [own] = useState(() => new GlNode());
  const node = parent ? (name && layers ? layers.get(name) : own) : null;
  const boxWidth = width ?? parent?.width ?? 0;
  const boxHeight = height ?? parent?.height ?? 0;
  const parentNode = parent?.node;
  useLayoutEffect(() => {
    if (!parentNode || !node) return;
    parentNode.add(node);
    return () => parentNode.remove(node);
  }, [node, parentNode]);
  useLayoutEffect(() => {
    node?.set({ x, y, z, width: boxWidth, height: boxHeight, clip, bake: baked });
  });
  return (
    <GlParentScope node={node} width={boxWidth} height={boxHeight}>
      {children}
    </GlParentScope>
  );
}
