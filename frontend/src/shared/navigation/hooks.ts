import { type RefCallback, useCallback, useRef, useSyncExternalStore } from 'react';

import { type ChildOptions, useNode, useOptionalStore, useStore } from './context';
import type { NavigationStore } from './store';

const noSubscription = () => () => undefined;

export interface FocusableResult<E extends HTMLElement> {
  ref: RefCallback<E>;
  /** Virtual focus: pass to the component's `focused`. */
  focused: boolean;
  /** Pointer focus: pass to the component's `onMouseMove` (or `onPointerFocus`). */
  onMouseMove: () => void;
}

/**
 * Registers a focusable element with a stable ID (an item key, never an array index) and returns
 * what the component renders it with. Mainly used inside library components. Without an ID or a
 * NavigationProvider it registers nothing and is never focused.
 */
export function useFocusable<E extends HTMLElement = HTMLElement>(
  id: string | undefined,
  options: ChildOptions = {}
): FocusableResult<E> {
  const store = useOptionalStore();
  const elementRef = useRef<E | null>(null);
  useNode(id, 'leaf', options, () => elementRef.current);
  const active = store && id !== undefined ? { store, id } : null;
  const focused = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        active ? active.store.subscribe(active.id, listener) : noSubscription(),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [store, id]
    ),
    () => (active ? active.store.isActive(active.id) : false),
    // Server render: nothing is focused before hydration
    () => false
  );
  return {
    ref: useCallback((element: E | null) => {
      elementRef.current = element;
    }, []),
    focused,
    onMouseMove: useCallback(() => {
      if (store && id !== undefined) store.pointerFocus(id);
    }, [store, id]),
  };
}

export interface CompositeResult<E extends HTMLElement> {
  /** On an element containing every part. */
  ref: RefCallback<E>;
  /** The focused part, or undefined: pass to the component's `focusedPart`. */
  focusedPart: string | undefined;
  onPointerFocus: (part: string) => void;
}

/**
 * One focusable with internal parts along the inline axis (a field and its trailing actions):
 * Left/Right move between parts before leaving it, entering lands on the near part, and Confirm
 * activates the focused part. Pass only the parts that are present. Inert without an ID or a
 * NavigationProvider, like useFocusable.
 */
export function useComposite<E extends HTMLElement = HTMLElement>(
  id: string | undefined,
  parts: readonly string[],
  options: ChildOptions = {}
): CompositeResult<E> {
  const store = useOptionalStore();
  const elementRef = useRef<E | null>(null);
  useNode(id, 'leaf', { ...options, parts }, () => elementRef.current);
  const active = store && id !== undefined ? { store, id } : null;
  const focusedPart = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        active ? active.store.subscribe(active.id, listener) : noSubscription(),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [store, id]
    ),
    () => (active ? active.store.activePartOf(active.id) : undefined),
    () => undefined
  );
  return {
    ref: useCallback((element: E | null) => {
      elementRef.current = element;
    }, []),
    focusedPart,
    onPointerFocus: useCallback(
      (part: string) => {
        if (store && id !== undefined) store.pointerFocus(id, part);
      },
      [store, id]
    ),
  };
}

/**
 * The focused leaf when it is inside a group or scope, else null: a group's shared description, a
 * rail that expands while it holds focus. Null without a provider or an ID.
 */
export function useActiveIdWithin(groupId: string | undefined): string | null {
  const store = useOptionalStore();
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => (store ? store.subscribeAll(listener) : noSubscription()),
      [store]
    ),
    () =>
      store && groupId !== undefined && store.activeWithin(groupId) ? store.getActiveId() : null,
    // Server render: nothing is focused before hydration
    () => null
  );
}

/** Whether a NavigationProvider is above: components then take focus from the layer. */
export function useHasNavigation(): boolean {
  return useOptionalStore() !== null;
}

/** Programmatic access: focus a node, lock the pointer during a key-driven animation. */
export function useNavigation() {
  const store = useStore();
  return {
    focus: store.focus,
    lockPointer: store.lockPointer,
    getActiveId: store.getActiveId,
    lastInput: store.lastInput,
  };
}

/** Like useNavigation, or null without a NavigationProvider (a component also used outside one). */
export function useOptionalNavigation() {
  const store = useOptionalStore();
  if (!store) return null;
  return {
    focus: store.focus,
    lockPointer: store.lockPointer,
    getActiveId: store.getActiveId,
    lastInput: store.lastInput,
  };
}

/**
 * The pointer lock when a NavigationProvider is above (ScrollArea and collections take it while a
 * key-driven animation runs), else null.
 */
export function useOptionalPointerLock(): (() => () => void) | null {
  return useOptionalStore()?.lockPointer ?? null;
}

/** The store itself, for the development inspector and tests. */
export function useNavigationStore(): NavigationStore {
  return useStore();
}
