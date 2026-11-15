import { type RefCallback, useCallback, useRef, useSyncExternalStore } from 'react';

import { type ChildOptions, useNode, useStore } from './context';
import type { NavigationStore } from './store';

export interface FocusableResult<E extends HTMLElement> {
  ref: RefCallback<E>;
  /** Virtual focus: pass to the component's `focused`. */
  focused: boolean;
  /** Pointer focus: pass to the component's `onMouseMove` (or `onPointerFocus`). */
  onMouseMove: () => void;
}

/**
 * Registers a focusable element with a stable ID (an item key, never an array index) and returns
 * what the component renders it with. Mainly used inside library components.
 */
export function useFocusable<E extends HTMLElement = HTMLElement>(
  id: string,
  options: ChildOptions = {}
): FocusableResult<E> {
  const store = useStore();
  const elementRef = useRef<E | null>(null);
  useNode(id, 'leaf', options, () => elementRef.current);
  const focused = useSyncExternalStore(
    useCallback(listener => store.subscribe(id, listener), [store, id]),
    () => store.isActive(id),
    // Server render: nothing is focused before hydration
    () => false
  );
  return {
    ref: useCallback((element: E | null) => {
      elementRef.current = element;
    }, []),
    focused,
    onMouseMove: useCallback(() => store.pointerFocus(id), [store, id]),
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
 * activates the focused part. Pass only the parts that are present.
 */
export function useComposite<E extends HTMLElement = HTMLElement>(
  id: string,
  parts: readonly string[],
  options: ChildOptions = {}
): CompositeResult<E> {
  const store = useStore();
  const elementRef = useRef<E | null>(null);
  useNode(id, 'leaf', { ...options, parts }, () => elementRef.current);
  const focusedPart = useSyncExternalStore(
    useCallback(listener => store.subscribe(id, listener), [store, id]),
    () => store.activePartOf(id),
    () => undefined
  );
  return {
    ref: useCallback((element: E | null) => {
      elementRef.current = element;
    }, []),
    focusedPart,
    onPointerFocus: useCallback((part: string) => store.pointerFocus(id, part), [store, id]),
  };
}

/** Programmatic access: focus a node, lock the pointer during a key-driven animation. */
export function useNavigation() {
  const store = useStore();
  return {
    focus: store.focus,
    lockPointer: store.lockPointer,
    getActiveId: store.getActiveId,
  };
}

/** The store itself, for the development inspector and tests. */
export function useNavigationStore(): NavigationStore {
  return useStore();
}
