import { createContext, useContext, useLayoutEffect, useRef } from 'react';

import type { NavigationStore } from './store';
import type { Direction, NavigationNode } from './types';

export const StoreContext = createContext<NavigationStore | null>(null);
/** The enclosing group or scope; null at the root. */
export const ParentContext = createContext<string | null>(null);

export function useStore(): NavigationStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Navigation hooks need a NavigationProvider above them.');
  return store;
}

export type NodeOptions = Omit<NavigationNode, 'id' | 'parent' | 'kind'>;

/** Registers a node under the enclosing group for as long as it is mounted. */
export function useNode(
  id: string,
  kind: NavigationNode['kind'],
  options: NodeOptions,
  element?: () => HTMLElement | null
): NavigationNode {
  const store = useStore();
  const parent = useContext(ParentContext);
  const node: NavigationNode = { id, parent, kind, ...options };
  const nodeRef = useRef(node);
  nodeRef.current = node;
  const elementRef = useRef(element);
  elementRef.current = element;

  useLayoutEffect(
    () => store.register(nodeRef.current, () => elementRef.current?.() ?? null),
    [store, id, parent]
  );
  useLayoutEffect(() => {
    store.update(nodeRef.current);
  });
  return node;
}

export interface ChildOptions {
  /** In a grid group: columns spanned. */
  span?: number;
  /** The selected child (current tab, active filter), entered first. */
  selected?: boolean;
  /** Explicit links out of this node, used sparingly. */
  overrides?: Partial<Record<Direction, string>>;
  disabled?: boolean;
}
