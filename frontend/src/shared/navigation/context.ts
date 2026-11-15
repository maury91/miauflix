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

/** The store when a NavigationProvider is above; library components work without one too. */
export function useOptionalStore(): NavigationStore | null {
  return useContext(StoreContext);
}

export type NodeOptions = Omit<NavigationNode, 'id' | 'parent' | 'kind'>;

/**
 * Registers a node under the enclosing group for as long as it is mounted. Nothing registers
 * without a provider or an ID (a component given only `focused`).
 */
export function useNode(
  id: string | undefined,
  kind: NavigationNode['kind'],
  options: NodeOptions,
  element?: () => HTMLElement | null
): void {
  const store = useOptionalStore();
  const parent = useContext(ParentContext);
  const node: NavigationNode = { id: id ?? '', parent, kind, ...options };
  const nodeRef = useRef(node);
  const elementRef = useRef(element);

  // Published on commit, never during render (a discarded render must not leave its closures);
  // declared first, so a re-registration below reads this commit's node
  useLayoutEffect(() => {
    nodeRef.current = node;
    elementRef.current = element;
  });
  useLayoutEffect(() => {
    if (!store || id === undefined) return;
    return store.register(nodeRef.current, () => elementRef.current?.() ?? null);
  }, [store, id, parent]);
  useLayoutEffect(() => {
    if (store && id !== undefined) store.update(nodeRef.current);
  });
}

export interface ChildOptions {
  /** In a grid group: columns spanned. */
  span?: number;
  /** The selected child (current tab, active filter), entered first. */
  selected?: boolean;
  /** Explicit links out of this node, used sparingly. */
  overrides?: Partial<Record<Direction, string>>;
  disabled?: boolean;
  tabOnly?: NavigationNode['tabOnly'];
  /** Composites: see NavigationNode. */
  stepPart?: NavigationNode['stepPart'];
  entryPart?: NavigationNode['entryPart'];
  /** Groups and composites with unloaded content past an edge: see NavigationNode. */
  more?: NavigationNode['more'];
  onMore?: NavigationNode['onMore'];
}
