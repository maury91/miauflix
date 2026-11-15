import { useComposite, useFocusable } from '@shared/navigation/hooks';
import { createContext, type Ref, type RefCallback, useCallback, useContext } from 'react';

/** Props of every focusable component. */
export interface NavigableProps {
  /**
   * A stable ID (an item key, never an array index). Under a NavigationProvider the component
   * registers with the navigation layer under it: the layer moves virtual focus to it, renders it
   * focused and focuses it on pointer movement. Without it, the caller sets `focused`.
   */
  navId?: string;
}

/** Focus handed down by a composite to one of its parts (a field's trailing IconButton). */
export interface InheritedFocus {
  focused: boolean;
  onPointerFocus: () => void;
}

export const InheritedFocusContext = createContext<InheritedFocus | null>(null);

/** One ref callback setting every given ref. */
export function useMergedRef<E>(...refs: (Ref<E> | undefined)[]): RefCallback<E> {
  return useCallback(
    (element: E | null) => {
      for (const ref of refs) {
        if (typeof ref === 'function') ref(element);
        else if (ref) (ref as { current: E | null }).current = element;
      }
    },
    // The refs are stable callbacks or ref objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );
}

interface NavFocusOptions {
  /** Virtual focus set by the caller instead of the layer. */
  focused?: boolean;
  disabled?: boolean;
  tabOnly?: boolean;
  /** Current state (the current tab, a pressed filter): the layer enters a group here first. */
  selected?: boolean;
  /** Columns spanned in a grid group. */
  span?: number;
}

export interface NavFocus<E extends HTMLElement> {
  ref: RefCallback<E>;
  focused: boolean;
  /** Pointer focus, for `onMouseMove`. */
  onPointerFocus: () => void;
}

/**
 * A focusable leaf's focus from every source: the caller's `focused`, the navigation layer (with
 * `navId` under a provider), or the composite around it (InheritedFocusContext).
 */
export function useNavFocus<E extends HTMLElement>(
  navId: string | undefined,
  { focused = false, disabled, selected, span, tabOnly }: NavFocusOptions,
  forwardedRef?: Ref<E>
): NavFocus<E> {
  const inherited = useContext(InheritedFocusContext);
  const nav = useFocusable<E>(navId, { disabled, selected, span, tabOnly });
  const ref = useMergedRef(forwardedRef, nav.ref);
  return {
    ref,
    focused: focused || nav.focused || (inherited?.focused ?? false),
    onPointerFocus: () => {
      nav.onMouseMove();
      inherited?.onPointerFocus();
    },
  };
}

/**
 * A composite's focused part from the caller's `focusedPart` or, with `navId` under a provider,
 * the navigation layer. Attach `ref` to an element containing every part.
 */
export function useNavComposite<P extends string, E extends HTMLElement = HTMLElement>(
  navId: string | undefined,
  parts: readonly P[],
  {
    focusedPart,
    onPointerFocus,
    disabled,
  }: { focusedPart?: P; onPointerFocus?: (part: P) => void; disabled?: boolean }
) {
  const nav = useComposite<E>(navId, parts, { disabled });
  return {
    ref: nav.ref,
    focusedPart: (focusedPart ?? nav.focusedPart) as P | undefined,
    onPointerFocus: (part: P) => {
      nav.onPointerFocus(part);
      onPointerFocus?.(part);
    },
  };
}
