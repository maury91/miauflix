import { claimVirtualFocus, useKeyboard } from '@shared/hooks/useKeyboard';
import { type ReactNode, useEffect, useId, useLayoutEffect, useState } from 'react';

import {
  type ChildOptions,
  ParentContext,
  StoreContext,
  useNode,
  useOptionalStore,
} from './context';
import { createNavigationStore } from './store';
import type { Direction, EdgePolicy, EntryPolicy, GroupLayout } from './types';

export interface NavigationProviderProps {
  children: ReactNode;
  /** See NavigationStoreOptions; on by default. */
  mirrorDomFocus?: boolean;
}

/**
 * The one virtual focus owner. Keys arrive through the existing `useKeyboard` dispatcher as its
 * page-wide scope, so an element scope from the current app (and component-intrinsic keys, which
 * listen earlier) still wins. Pointer position is tracked once, for the pointer lock.
 */
export function NavigationProvider({ children, mirrorDomFocus = true }: NavigationProviderProps) {
  const [store] = useState(() => createNavigationStore({ mirrorDomFocus }));

  const direction = (to: Direction) => (event: KeyboardEvent) =>
    store.move(to, event).type !== 'unhandled';
  useKeyboard({
    onLeft: direction('left'),
    onRight: direction('right'),
    onUp: direction('up'),
    onDown: direction('down'),
    onConfirm: event => store.confirm(event),
    // Backspace edits text; any other Back leaves the edit layer before overlays see it
    onBack: event => event.key !== 'Backspace' && store.back(),
    onTab: event => store.tab(event.shiftKey),
    onEditConfirm: event => {
      const field = event.target as HTMLInputElement;
      // After the native behavior (a form submits), editing ends
      window.setTimeout(() => {
        if (document.activeElement === field) field.blur();
      });
      return false;
    },
  });

  useEffect(() => {
    const release = claimVirtualFocus();
    const onMove = (event: MouseEvent) => store.trackPointer(event.clientX, event.clientY);
    // A resize can re-wrap items without resizing any of them: cached geometry is stale
    const onResize = () => store.invalidateGeometry();
    // A tap or click into a field focuses it without moving the pointer first
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element) store.domFocus(event.target);
    };
    window.addEventListener('mousemove', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      release();
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', onFocusIn);
      store.dispose();
    };
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export interface FocusGroupProps extends ChildOptions {
  /** Stable ID (for overrides and defaults); generated when omitted. */
  id?: string;
  layout: GroupLayout;
  /** Grid groups: the columns in force. */
  columns?: number;
  /** `bubble` by default. */
  edge?: EdgePolicy;
  /** `remembered` by default. */
  entry?: EntryPolicy;
  defaultId?: string;
  children: ReactNode;
}

/**
 * Groups children for movement (style guide, sections 9 and 10): Stack-like axes, Grid
 * coordinates or measured rectangles, entry memory and an edge policy. Renders no element.
 */
export function FocusGroup({ id: idProp, children, ...options }: FocusGroupProps) {
  const ownId = useId();
  const id = idProp ?? ownId;
  useNode(id, 'group', options);
  if (!useOptionalStore()) return children;
  return <ParentContext.Provider value={id}>{children}</ParentContext.Provider>;
}

export interface FocusScopeProps {
  id?: string;
  /**
   * An overlay (dialog, modal popover, open menu): it goes on the scope stack, focus starts
   * inside, nothing behind it can be reached, edges stop, and closing restores the opener.
   */
  contain?: boolean;
  /** How the scope's own children are arranged; `vertical` by default. */
  layout?: GroupLayout;
  columns?: number;
  /** The descendant focused first (else the scope's entry policy). */
  initialId?: string;
  /** Takes focus on mount even when something else has it; overlays always do. */
  autoFocus?: boolean;
  children: ReactNode;
}

/**
 * A page, pane or overlay boundary. A root scope takes focus when nothing has it; a contained
 * scope takes it on open and gives it back to its opener on close. Like FocusGroup, it only
 * renders its children without a NavigationProvider.
 */
export function FocusScope({
  id: idProp,
  contain = false,
  layout = 'vertical',
  columns,
  initialId,
  autoFocus = false,
  children,
}: FocusScopeProps) {
  const store = useOptionalStore();
  const ownId = useId();
  const id = idProp ?? ownId;
  useNode(id, 'scope', {
    layout,
    columns,
    edge: contain ? 'contain' : 'bubble',
    defaultId: initialId,
  });

  // After the children registered (their layout effects run first)
  useLayoutEffect(() => {
    if (!store) return;
    const close = contain ? store.pushScope(id) : undefined;
    const active = store.getActiveId();
    // A nested overlay open from the start already took focus inside this scope, and keeps it
    // over this scope's own autoFocus
    const take = contain
      ? !store.activeWithin(id)
      : (autoFocus && !store.scopeOpenWithin(id)) || active === null;
    if (take) store.focus(id);
    return close;
    // Opening and closing only; the initial target is read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, id, contain]);

  if (!store) return children;
  return <ParentContext.Provider value={id}>{children}</ParentContext.Provider>;
}
