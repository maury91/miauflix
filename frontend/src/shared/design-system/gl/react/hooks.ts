import {
  createContext,
  type RefCallback,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { GlRenderer } from '../core/renderer';
import { GlNode } from '../core/scene';
import type { ImageStatus, Painter } from '../paint/painter';

/**
 * Inside a GlSurface, components that have a GL form register retained nodes with `useGlNode`
 * instead of painting visible DOM; their DOM stays for focus, `data-focused` and semantics.
 * Geometry flows down through GlParent (each parent gives its children a box), never from layout.
 */
export interface GlParent {
  renderer: GlRenderer;
  node: GlNode;
  /** The box children fill (px). */
  width: number;
  height: number;
  /** Corner radius children's fills follow (a tile's frame). */
  radius: number;
}

const GlContext = createContext<GlParent | null>(null);

/** The GL parent, or null outside a GlSurface (components then render their DOM form). */
export function useGlParent() {
  return useContext(GlContext);
}

export const GlParentProvider = GlContext.Provider;

/** How a component renders: DOM, or drawn by the GlSurface it's in. */
export type RenderMode = 'dom' | 'gl';

/**
 * Inside a GlSurface (and not taken out of it by a GlParentScope without a node), `gl`: the
 * component renders its GL view. Read once by the public component, which renders one view.
 */
export function useRenderMode(): RenderMode {
  return useContext(GlContext) ? 'gl' : 'dom';
}

/**
 * The surface's named layers: nodes created on first use, by the GlLayer that places them or by a
 * component that draws into them from elsewhere in the tree (`useGlLayer`), in either order.
 */
export class GlLayers {
  private nodes = new Map<string, GlNode>();

  get(name: string) {
    let node = this.nodes.get(name);
    if (!node) this.nodes.set(name, (node = new GlNode()));
    return node;
  }
}

const LayersContext = createContext<GlLayers | null>(null);

export const GlLayersProvider = LayersContext.Provider;

export function useGlLayers() {
  return useContext(LayersContext);
}

/** A named layer's node (see GlLayer), to draw into from anywhere under the surface. */
export function useGlLayer(name: string | undefined): GlNode | null {
  const layers = useGlLayers();
  const parent = useGlParent();
  return name && parent && layers ? layers.get(name) : null;
}

/**
 * A node attached to the GL parent (or `parentNode`) while the component is mounted; null outside
 * a surface. Created during render, so children (whose effects run first) can attach to it.
 */
export function useGlNode(parentNode?: GlNode | null): GlNode | null {
  const context = useGlParent();
  const parent = parentNode === undefined ? (context?.node ?? null) : parentNode;
  const [node] = useState(() => new GlNode());
  useLayoutEffect(() => {
    if (!parent) return;
    parent.add(node);
    return () => parent.remove(node);
  }, [node, parent]);
  return context ? node : null;
}

/**
 * A ref for the element the pointer over `node`'s box goes to: its semantic twin, which gets the
 * surface's mouse moves and clicks there (see hitTest).
 */
export function useGlTarget(node: GlNode | null): RefCallback<Element> {
  return useCallback(
    (element: Element | null) => {
      if (node) node.target = element;
    },
    [node]
  );
}

/**
 * Sets a node's paint callback and paints it again on the next frame: after commits where `deps`
 * changed (every commit without them). It also runs again when a texture it asked for becomes
 * ready. A paint rebuilds the node's sprites, and inside a baked layer re-bakes it: give `deps`
 * (everything the paint reads) where the component re-renders often.
 */
export function useGlPaint(
  node: GlNode | null,
  paint: (painter: Painter) => void,
  deps?: readonly unknown[]
) {
  const last = useRef<readonly unknown[] | null>(null);
  useLayoutEffect(() => {
    if (!node) return;
    node.paint = paint;
    const previous = last.current;
    last.current = deps ?? null;
    if (
      deps &&
      previous &&
      previous.length === deps.length &&
      previous.every((value, index) => Object.is(value, deps[index]))
    )
      return;
    node.repaint();
  });
}

/** An image's load state on the surface: lets a component fall back when it fails. */
export function useGlImageStatus(src: string | null | undefined): ImageStatus | undefined {
  const renderer = useGlParent()?.renderer;
  const subscribe = useCallback(
    (listener: () => void) =>
      renderer && src ? renderer.subscribeImage(src, listener) : () => undefined,
    [renderer, src]
  );
  return useSyncExternalStore(
    subscribe,
    () => (renderer && src ? renderer.imageStatus(src) : undefined),
    () => undefined
  );
}
