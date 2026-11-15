import { activate, canMirror, isEditable, isShown } from './dom';
import { enter, isWithin, resolveMove } from './resolve';
import type { Direction, NavigationNode, NavigationTree, Rect, Resolution } from './types';

/** Home's held-arrow stepping: repeats faster than this are swallowed. */
export const heldKeyInterval = 90;

export type InputKind = 'key' | 'pointer' | 'program';

interface Registration {
  node: NavigationNode;
  element: () => HTMLElement | null;
}

interface Scope {
  id: string;
  /** What was focused when the scope opened, restored when it closes. */
  opener: string | null;
}

export interface NavigationSnapshot {
  activeId: string | null;
  part: string | undefined;
  scopes: readonly string[];
  last: { key: string; resolution: Resolution } | null;
  nodes: readonly NavigationNode[];
  remembered: Readonly<Record<string, string>>;
}

export interface NavigationStoreOptions {
  /**
   * Moves DOM focus onto the focused element where that doesn't enter edit mode (buttons, rows),
   * so assistive technology follows virtual focus. On by default.
   */
  mirrorDomFocus?: boolean;
}

const unionRect = (rects: readonly Rect[]): Rect | null =>
  rects.length === 0
    ? null
    : {
        top: Math.min(...rects.map(rect => rect.top)),
        right: Math.max(...rects.map(rect => rect.right)),
        bottom: Math.max(...rects.map(rect => rect.bottom)),
        left: Math.min(...rects.map(rect => rect.left)),
      };

/**
 * The transient navigation registry (style guide, section 10): nodes and their elements, the one
 * active ID, per-group memory, the overlay scope stack and the pointer lock. Not app state: only
 * durable route/media memory belongs in Redux.
 */
export function createNavigationStore({ mirrorDomFocus = true }: NavigationStoreOptions = {}) {
  const registrations = new Map<string, Registration>();
  const childrenOf = new Map<string | null, Set<string>>();
  const memory = new Map<string, string>();
  const gridColumns = new Map<string, number>();
  const scopes: Scope[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const anyListeners = new Set<() => void>();

  let activeId: string | null = null;
  let activePart: string | undefined;
  let last: NavigationSnapshot['last'] = null;
  let lastInput: InputKind = 'program';
  let lastKeyMove = 0;
  let pointerLocks = 0;
  let pointer: { x: number; y: number } | null = null;
  /** Where the pointer rested when keys took over: events there are not real movement. */
  let pointerAnchor: { x: number; y: number } | null = null;
  let mirrored: HTMLElement | null = null;
  let generation = 0;

  const notify = (ids: readonly (string | null)[]) => {
    for (const id of ids) {
      if (id !== null) listeners.get(id)?.forEach(listener => listener());
    }
    anyListeners.forEach(listener => listener());
  };

  const elementOf = (id: string) => registrations.get(id)?.element() ?? null;

  /** A tree over the registry for one operation, caching what it reads from the DOM. */
  function tree(): NavigationTree {
    const eligibleCache = new Map<string, boolean>();
    const anchorCache = new Map<string, HTMLElement | null>();
    const orderCache = new Map<string, readonly string[]>();
    const rectCache = new Map<string, Rect | null>();

    const anchor = (id: string): HTMLElement | null => {
      if (anchorCache.has(id)) return anchorCache.get(id)!;
      let result: HTMLElement | null = null;
      const registration = registrations.get(id);
      if (registration?.node.kind === 'leaf') result = registration.element();
      else {
        for (const child of ordered(id)) {
          result = anchor(child);
          if (result) break;
        }
      }
      anchorCache.set(id, result);
      return result;
    };

    function ordered(id: string): readonly string[] {
      const cached = orderCache.get(id);
      if (cached) return cached;
      const ids = [...(childrenOf.get(id) ?? [])];
      // Registration order until anchors exist; then document order
      orderCache.set(id, ids);
      const withAnchor = ids.map(child => ({ child, element: anchor(child) }));
      withAnchor.sort((a, b) => {
        if (!a.element || !b.element) return 0;
        if (a.element === b.element) return 0;
        const position = a.element.compareDocumentPosition(b.element);
        return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      const result = withAnchor.map(entry => entry.child);
      orderCache.set(id, result);
      return result;
    }

    const eligible = (id: string): boolean => {
      if (eligibleCache.has(id)) return eligibleCache.get(id)!;
      const registration = registrations.get(id);
      let result = false;
      if (registration && !registration.node.disabled) {
        if (registration.node.kind === 'leaf') {
          const element = registration.element();
          result = Boolean(element && isShown(element));
        } else {
          result = ordered(id).some(eligible);
        }
      }
      eligibleCache.set(id, result);
      return result;
    };

    const rect = (id: string): Rect | null => {
      if (rectCache.has(id)) return rectCache.get(id)!;
      const registration = registrations.get(id);
      let result: Rect | null = null;
      if (registration?.node.kind === 'leaf') {
        const box = registration.element()?.getBoundingClientRect();
        result = box
          ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left }
          : null;
      } else if (registration) {
        result = unionRect(
          ordered(id).flatMap(child => {
            const childRect = eligible(child) ? rect(child) : null;
            return childRect ? [childRect] : [];
          })
        );
      }
      rectCache.set(id, result);
      return result;
    };

    return {
      node: id => registrations.get(id)?.node,
      children: ordered,
      eligible,
      rect,
      rtl: id => {
        const element = anchor(id);
        return element ? getComputedStyle(element).direction === 'rtl' : false;
      },
      remembered: groupId => memory.get(groupId),
      gridColumn: groupId => gridColumns.get(groupId),
    };
  }

  const topScope = () => scopes[scopes.length - 1]?.id ?? null;

  /** Leaves an edit layer (DOM focus in a text field) that virtual focus is leaving. */
  function endEditingOutside(element: HTMLElement | null) {
    const editing = document.activeElement;
    if (editing instanceof HTMLElement && isEditable(editing) && !element?.contains(editing)) {
      editing.blur();
    }
  }

  function setActive(id: string | null, part: string | undefined, input: InputKind) {
    lastInput = input;
    if (id === activeId && part === activePart) return;
    const previous = activeId;
    activeId = id;
    activePart = part;
    generation += 1;
    // A move that isn't a grid step forgets the grid's kept column
    if (input !== 'key') gridColumns.clear();
    if (id !== null) {
      // Up to an overlay's boundary: what is behind it keeps its own memory
      for (let node = registrations.get(id)?.node; node?.parent; ) {
        if (node.edge === 'contain' && node.kind === 'scope') break;
        memory.set(node.parent, id);
        node = registrations.get(node.parent)?.node;
      }
    }
    const element = id === null ? null : elementOf(id);
    endEditingOutside(element);
    if (mirrorDomFocus) {
      if (element && canMirror(element)) {
        if (document.activeElement !== element) element.focus({ preventScroll: true });
        mirrored = element;
      } else if (mirrored && document.activeElement === mirrored) {
        mirrored.blur();
        mirrored = null;
      }
    }
    notify(previous === id ? [id] : [previous, id]);
  }

  /** Focus a node: a leaf directly, a group or scope at its entry. */
  function focus(
    id: string,
    { part, input = 'program' }: { part?: string; input?: InputKind } = {}
  ) {
    const entry = enter(tree(), id, null, null);
    if (!entry) return false;
    setActive(entry.id, part ?? entry.part, input);
    return true;
  }

  /** Focus back inside the topmost scope (or the first root) after focus was lost. */
  function recover(input: InputKind = 'program'): boolean {
    const scope = topScope();
    const roots = scope !== null ? [scope] : [...(childrenOf.get(null) ?? [])];
    return roots.some(root => focus(root, { input }));
  }

  function activeIsValid(view: NavigationTree) {
    return activeId !== null && view.eligible(activeId) && isWithin(view, activeId, topScope());
  }

  function move(direction: Direction, event?: KeyboardEvent): Resolution {
    const now = Date.now();
    if (event?.repeat && now - lastKeyMove < heldKeyInterval) {
      return { type: 'handled', part: activePart ?? '', reason: 'held key throttled' };
    }
    lastKeyMove = now;
    pointerAnchor = pointer;
    const view = tree();
    let resolution: Resolution;
    if (!activeIsValid(view)) {
      // The first direction after focus was lost only brings it back
      resolution = recover('key')
        ? { type: 'move', targetId: activeId!, reason: 'recovered lost focus' }
        : { type: 'unhandled', reason: 'nothing to focus' };
    } else {
      resolution = resolveMove(view, activeId!, direction, {
        scopeId: topScope(),
        part: activePart,
      });
      if (resolution.type === 'move') {
        setActive(resolution.targetId, resolution.part, 'key');
        if (resolution.gridColumn) {
          gridColumns.clear();
          gridColumns.set(resolution.gridColumn.groupId, resolution.gridColumn.column);
        } else gridColumns.clear();
      } else if (resolution.type === 'handled') {
        setActive(activeId, resolution.part, 'key');
      }
    }
    last = { key: direction, resolution };
    anyListeners.forEach(listener => listener());
    return resolution;
  }

  /** Confirm: activates the focused element once; held Confirm never repeats. */
  function confirm(event?: KeyboardEvent): boolean {
    if (activeId === null) return false;
    if (event?.repeat) return true;
    const element = elementOf(activeId);
    if (!element || !tree().eligible(activeId)) return false;
    lastInput = 'key';
    return activate(element);
  }

  /** Back leaves the edit layer first; otherwise it belongs to overlays and the page. */
  function back(): boolean {
    const editing = document.activeElement;
    if (!(editing instanceof HTMLElement) || !isEditable(editing)) return false;
    editing.blur();
    return true;
  }

  /** Tab and Shift+Tab: the eligible leaves of the topmost scope in document order. */
  function tab(backward: boolean): boolean {
    const view = tree();
    const scope = topScope();
    const leaves: { id: string; element: HTMLElement }[] = [];
    for (const [id, registration] of registrations) {
      if (registration.node.kind !== 'leaf' || !view.eligible(id) || !isWithin(view, id, scope)) {
        continue;
      }
      const element = registration.element();
      if (element) leaves.push({ id, element });
    }
    if (leaves.length === 0) return false;
    leaves.sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    const index = leaves.findIndex(leaf => leaf.id === activeId);
    let next = index === -1 ? (backward ? leaves.length - 1 : 0) : index + (backward ? -1 : 1);
    if (next < 0 || next >= leaves.length) {
      // Only a containing scope traps Tab; a page lets it leave natively
      const contained = scope !== null && registrations.get(scope)?.node.edge === 'contain';
      if (!contained) return false;
      next = backward ? leaves.length - 1 : 0;
    }
    const target = registrations.get(leaves[next].id)!.node;
    // Keys took over: the pointer resting here is not movement, and no grid column is kept
    pointerAnchor = pointer;
    gridColumns.clear();
    setActive(target.id, target.parts?.[0], 'key');
    return true;
  }

  /** The pointer moved onto a registered element: it becomes the focused one, unless locked. */
  function pointerFocus(id: string, part?: string) {
    if (pointerLocks > 0) return;
    if (
      lastInput === 'key' &&
      pointer &&
      pointerAnchor &&
      pointer.x === pointerAnchor.x &&
      pointer.y === pointerAnchor.y
    ) {
      // Content moved under a resting pointer; that is not a real movement
      return;
    }
    const view = tree();
    if (!view.eligible(id) || !isWithin(view, id, topScope())) return;
    setActive(id, part ?? registrations.get(id)?.node.parts?.[0], 'pointer');
  }

  /**
   * A key-driven animation (row paging, page scroll) locks the pointer until it ends. Afterwards
   * only a real movement focuses again.
   */
  function lockPointer(): () => void {
    pointerLocks += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      pointerLocks -= 1;
      pointerAnchor = pointer;
    };
  }

  /** Where the pointer is, from a window capture listener the provider owns. */
  function trackPointer(x: number, y: number) {
    pointer = { x, y };
  }

  function register(node: NavigationNode, element: () => HTMLElement | null = () => null) {
    const registration: Registration = { node, element };
    registrations.set(node.id, registration);
    if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, new Set());
    childrenOf.get(node.parent)!.add(node.id);

    return () => {
      if (registrations.get(node.id) !== registration) return;
      const wasActive = activeId === node.id;
      // Candidates while the DOM is still there (layout cleanups run before nodes are removed)
      const fallbacks = wasActive ? removalCandidates(node.id) : [];
      registrations.delete(node.id);
      childrenOf.get(node.parent)?.delete(node.id);
      if (!wasActive) return;
      const removedAt = generation;
      // After the whole commit: a closing scope restores its opener first
      queueMicrotask(() => {
        if (generation !== removedAt) return;
        const view = tree();
        for (const candidate of fallbacks) {
          if (!registrations.has(candidate) || !isWithin(view, candidate, topScope())) continue;
          const entry = enter(view, candidate, null, null);
          if (entry) {
            setActive(entry.id, entry.part, 'program');
            return;
          }
        }
        if (!recover()) setActive(null, undefined, 'program');
      });
    };
  }

  /** The nearest siblings first (next, then previous), then each ancestor group outward. */
  function removalCandidates(id: string): string[] {
    const view = tree();
    const candidates: string[] = [];
    let current = registrations.get(id)?.node;
    while (current?.parent) {
      const siblings = view.children(current.parent);
      const index = siblings.indexOf(current.id);
      for (let distance = 1; distance < siblings.length; distance++) {
        if (index + distance < siblings.length) candidates.push(siblings[index + distance]);
        if (index - distance >= 0) candidates.push(siblings[index - distance]);
      }
      candidates.push(current.parent);
      current = registrations.get(current.parent)?.node;
    }
    return candidates;
  }

  /** Updates a node's options in place (each render); its parent never changes. */
  function update(node: NavigationNode) {
    const registration = registrations.get(node.id);
    if (registration) registration.node = node;
  }

  /** Opens an overlay scope above the others; the returned function closes it. */
  function pushScope(id: string): () => void {
    const view = tree();
    // A scope open from the start inside this one registered first; this one goes below it
    const descendant = scopes.findIndex(other => isWithin(view, other.id, id));
    const scope: Scope = {
      id,
      opener: descendant === -1 ? activeId : scopes[descendant].opener,
    };
    if (descendant === -1) scopes.push(scope);
    else scopes.splice(descendant, 0, scope);
    return () => {
      const index = scopes.indexOf(scope);
      if (index === -1) return;
      scopes.splice(index, 1);
      // Only the topmost scope closing moves focus: back to its opener, else into what is now on top
      if (index !== scopes.length) return;
      const view = tree();
      // Its leaves may have unregistered first, in the same commit
      const inside =
        activeId === null || !registrations.has(activeId) || isWithin(view, activeId, id);
      if (!inside) return;
      const opener = scope.opener;
      // The page behind may still be `inert` from the closing overlay (removed in a passive effect),
      // so the opener only needs to be there and enabled
      const openerElement = opener === null ? null : elementOf(opener);
      const openerUsable =
        opener !== null &&
        Boolean(openerElement?.isConnected) &&
        !registrations.get(opener)?.node.disabled &&
        !(openerElement as HTMLButtonElement | null)?.disabled;
      if (openerUsable && isWithin(view, opener!, topScope())) {
        setActive(opener!, registrations.get(opener!)?.node.parts?.[0], 'program');
      } else {
        // The opener is gone: focus waits for the removal fallback or the next direction
        if (!recover()) setActive(null, undefined, 'program');
      }
    };
  }

  return {
    register,
    update,
    focus,
    move,
    confirm,
    back,
    tab,
    pointerFocus,
    lockPointer,
    trackPointer,
    pushScope,
    recover,
    isActive: (id: string) => activeId === id,
    /** Whether the focused leaf is inside a node. */
    activeWithin: (id: string) => activeId !== null && isWithin(tree(), activeId, id),
    /** Whether an overlay scope inside this node is open (it owns focus until it closes). */
    scopeOpenWithin: (id: string) => {
      const view = tree();
      return scopes.some(scope => scope.id !== id && isWithin(view, scope.id, id));
    },
    activePartOf: (id: string) => (activeId === id ? activePart : undefined),
    getActiveId: () => activeId,
    subscribe(id: string, listener: () => void) {
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id)!.add(listener);
      return () => {
        listeners.get(id)?.delete(listener);
      };
    },
    subscribeAll(listener: () => void) {
      anyListeners.add(listener);
      return () => {
        anyListeners.delete(listener);
      };
    },
    /** For the development inspector and tests. */
    snapshot(): NavigationSnapshot {
      return {
        activeId,
        part: activePart,
        scopes: scopes.map(scope => scope.id),
        last,
        nodes: [...registrations.values()].map(registration => registration.node),
        remembered: Object.fromEntries(memory),
      };
    },
  };
}

export type NavigationStore = ReturnType<typeof createNavigationStore>;
