import { type ReactNode, useLayoutEffect, useMemo } from 'react';

import type { GlNode } from '../core/scene';
import { GlParentProvider, useGlNode, useGlParent } from './hooks';

/** Children drawn into `node`, a box of `width` × `height` (null: render them as they are). */
export function GlParentScope({
  node,
  width,
  height,
  children,
}: {
  node: GlNode | null;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const parent = useGlParent();
  const value = useMemo(
    () => (parent && node ? { renderer: parent.renderer, node, width, height, radius: 0 } : null),
    [height, node, parent, width]
  );
  if (!value) return <>{children}</>;
  return <GlParentProvider value={value}>{children}</GlParentProvider>;
}

/** A positioned group: its own box for the children inside. */
export function GlGroup({
  x = 0,
  y = 0,
  width,
  height,
  clip = false,
  children,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  clip?: boolean;
  children: ReactNode;
}) {
  const parent = useGlParent();
  const node = useGlNode();
  const boxWidth = width ?? parent?.width ?? 0;
  const boxHeight = height ?? parent?.height ?? 0;
  useLayoutEffect(() => {
    node?.set({ x, y, width: boxWidth, height: boxHeight, clip });
  });
  return (
    <GlParentScope node={node} width={boxWidth} height={boxHeight}>
      {children}
    </GlParentScope>
  );
}
