import {
  activate,
  canMirror,
  editableSelector,
  isEditable,
  isNativeControl,
  isShown,
  mirrorTarget,
} from './dom';
import { enter, isWithin, resolveMove } from './resolve';
import type { Direction, Edge, NavigationNode, NavigationTree, Rect, Resolution } from './types';

/** Home's held-arrow stepping: repeats faster than this are swallowed. */
export const heldKeyInterval = 90;

export type InputKind = 'key' | 'pointer' | 'program';

interface Registration {
  node: NavigationNode;
  element: () => HTMLElement | null;
}

/** A move waiting for content past a group's edge, and the intent it was made with. */
interface PendingMove {
  groupId: string;
  edge: Edge;
  fromId: string;
  part: string | undefined;
  direction: Direction;
  scopeId: string | null;
  controller: AbortController;
  /** The loader's promise settled: a new press asks again. */
  settled: boolean;
}

interface GroupGeometry {
  rects: ReadonlyMap<string, Rect | null>;
  /** One child element, re-read on later moves to shift the cached rectangles. */
  anchor: HTMLElement | null;
  anchorAt: { left: number; top: number } | null;
  /** Every leaf element read, watched for size changes. */
  elements: readonly HTMLElement[];
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
  /** The move waiting for content, if any. */
  pending: { groupId: string; edge: Edge } | null;
  /** Spatial groups whose child rectangles are cached. */
  geometry: readonly string[];
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
  let pending: PendingMove | null = null;
  let retryQueued = false;

  /**
   * Spatial groups' child rectangles (style guide, section 10: geometry is cached per group, only
   * for spatial layouts, and recalculated on layout change). Measured in one batch on the first
   * move that needs them; later moves read one anchor element and shift the cache by how far it
   * moved, so scrolling and transform reveals cost one read.
   */
  const geometry = new Map<string, GroupGeometry>();
  /** The groups each observed element was measured for. */
  const measuredFor = new Map<Element, Set<string>>();
  /** Elements past ResizeObserver's initial notification, which reports no change. */
  const observing = new WeakSet<Element>();
  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => {
          for (const { target } of entries) {
            if (!observing.has(target)) {
              observing.add(target);
              continue;
            }
            for (const groupId of [...(measuredFor.get(target) ?? [])]) dropGeometry(groupId);
          }
        });

  function dropGeometry(groupId: string) {
    const entry = geometry.get(groupId);
    if (!entry) return;
    geometry.delete(groupId);
    for (const element of entry.elements) {
      const groups = measuredFor.get(element);
      groups?.delete(groupId);
      if (groups?.size === 0) {
        measuredFor.delete(element);
        observing.delete(element);
        resizeObserver?.unobserve(element);
      }
    }
  }

  /** A structural change inside these groups (a child added or removed) moves their children. */
  function dropGeometryAbove(parent: string | null) {
    for (let id = parent; id !== null; id = registrations.get(id)?.node.parent ?? null) {
      dropGeometry(id);
    }
  }

  /** Layout changed in a way no element's size shows (a window resize re-wrapping items). */
  function invalidateGeometry() {
    if (geometry.size === 0) return;
    for (const groupId of [...geometry.keys()]) dropGeometry(groupId);
    // The inspector shows the cache
    anyListeners.forEach(listener => listener());
  }

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
    const groupRectsCache = new Map<string, ReadonlyMap<string, Rect | null>>();
    /** Leaf elements read by `measure` while a group's cache is being filled. */
    let collecting: HTMLElement[] | null = null;

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

    /** A fresh rectangle: a leaf's box, or the union of a group's eligible descendants. */
    const measure = (id: string): Rect | null => {
      if (rectCache.has(id)) return rectCache.get(id)!;
      const registration = registrations.get(id);
      let result: Rect | null = null;
      if (registration?.node.kind === 'leaf') {
        const element = registration.element();
        const box = element?.getBoundingClientRect();
        if (element && collecting) collecting.push(element);
        result = box
          ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left }
          : null;
      } else if (registration) {
        result = unionRect(
          ordered(id).flatMap(child => {
            const childRect = eligible(child) ? measure(child) : null;
            return childRect ? [childRect] : [];
          })
        );
      }
      rectCache.set(id, result);
      return result;
    };

    /** A spatial group's child rectangles: cached, shifted by its anchor's movement since. */
    const groupRects = (groupId: string): ReadonlyMap<string, Rect | null> => {
      const memo = groupRectsCache.get(groupId);
      if (memo) return memo;
      let entry = geometry.get(groupId);
      if (entry && !entry.anchor?.isConnected) {
        dropGeometry(groupId);
        entry = undefined;
      }
      let result: ReadonlyMap<string, Rect | null>;
      if (!entry) {
        // One batch of reads, no writes in between
        const elements: HTMLElement[] = [];
        collecting = elements;
        const rects = new Map<string, Rect | null>();
        for (const child of ordered(groupId)) rects.set(child, measure(child));
        collecting = null;
        const anchorElement = elements.find(element => element.getClientRects().length > 0);
        const anchorBox = anchorElement?.getBoundingClientRect();
        geometry.set(groupId, {
          rects,
          anchor: anchorElement ?? null,
          anchorAt: anchorBox ? { left: anchorBox.left, top: anchorBox.top } : null,
          elements,
        });
        for (const element of elements) {
          if (!measuredFor.has(element)) {
            measuredFor.set(element, new Set());
            resizeObserver?.observe(element);
          }
          measuredFor.get(element)!.add(groupId);
        }
        result = rects;
      } else {
        const box = entry.anchor?.getBoundingClientRect();
        const dx = box && entry.anchorAt ? box.left - entry.anchorAt.left : 0;
        const dy = box && entry.anchorAt ? box.top - entry.anchorAt.top : 0;
        result =
          dx === 0 && dy === 0
            ? entry.rects
            : new Map(
                [...entry.rects].map(([child, cached]) => [
                  child,
                  cached && {
                    top: cached.top + dy,
                    right: cached.right + dx,
                    bottom: cached.bottom + dy,
                    left: cached.left + dx,
                  },
                ])
              );
      }
      groupRectsCache.set(groupId, result);
      return result;
    };

    const rect = (id: string): Rect | null => {
      const parent = registrations.get(id)?.node.parent ?? null;
      if (parent !== null && registrations.get(parent)?.node.layout === 'spatial') {
        const rects = groupRects(parent);
        if (rects.has(id)) return rects.get(id)!;
      }
      return measure(id);
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

  /** A composite's part that is its own native control, marked `data-nav-part` inside it. */
  function partElement(element: HTMLElement, part: string): HTMLElement | null {
    return element.querySelector<HTMLElement>(`[data-nav-part="${CSS.escape(part)}"]`);
  }

  function setActive(id: string | null, part: string | undefined, input: InputKind) {
    lastInput = input;
    if (id === activeId && part === activePart) return;
    // Focus moved on: a move still waiting for content is stale
    cancelPending();
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
    if (mirrorDomFocus) mirrorFocus(element);
    notify(previous === id ? [id] : [previous, id]);
    // A part rendered by this move (a carousel item scrolled in): mirror once React committed
    if (mirrorDomFocus && element && part !== undefined && mirrored === null) {
      const at = generation;
      queueMicrotask(() => {
        if (generation === at && mirrored === null) mirrorFocus(elementOf(id!));
      });
    }
  }

  /** DOM focus follows virtual focus where that doesn't enter edit mode (style guide, section 10). */
  function mirrorFocus(element: HTMLElement | null) {
    const target = element && mirrorTarget(element, activePart);
    const current = document.activeElement;
    if (target) {
      if (current !== target) target.focus({ preventScroll: true });
      mirrored = target;
    } else if (
      current instanceof HTMLElement &&
      // What we focused, or a native control left focused outside the new target (a select or
      // range the pointer focused): its keys would stay its own
      (current === mirrored || (isNativeControl(current) && !element?.contains(current)))
    ) {
      current.blur();
      mirrored = null;
    } else {
      mirrored = null;
    }
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
      if (resolution.type === 'pending') requestMore(resolution, direction, event?.repeat ?? false);
      else {
        // Any other result is a new intent
        cancelPending();
        apply(resolution);
      }
    }
    last = { key: direction, resolution };
    anyListeners.forEach(listener => listener());
    return resolution;
  }

  function apply(resolution: Resolution) {
    if (resolution.type === 'move') {
      setActive(resolution.targetId, resolution.part, 'key');
      gridColumns.clear();
      if (resolution.gridColumn) {
        gridColumns.set(resolution.gridColumn.groupId, resolution.gridColumn.column);
      }
    } else if (resolution.type === 'handled') {
      setActive(activeId, resolution.part, 'key');
    }
  }

  /**
   * A move reached unloaded content (style guide, section 10, dynamic content): ask the group
   * once, with a token aborted by any newer intent. Repeating the same move waits on the same
   * request until its loader settles (or returned nothing); a held key never asks twice.
   */
  function requestMore(
    resolution: Extract<Resolution, { type: 'pending' }>,
    direction: Direction,
    repeat: boolean
  ) {
    const { groupId, edge } = resolution;
    if (
      pending &&
      // A held key never asks twice; a new press asks again once the loader settled
      (!pending.settled || repeat) &&
      pending.groupId === groupId &&
      pending.edge === edge &&
      pending.direction === direction &&
      pending.fromId === activeId &&
      pending.part === activePart
    ) {
      return;
    }
    cancelPending();
    const request: PendingMove = {
      groupId,
      edge,
      fromId: activeId!,
      part: activePart,
      direction,
      scopeId: topScope(),
      controller: new AbortController(),
      settled: false,
    };
    pending = request;
    // Failed: focus stays, and the next press asks again
    const failed = () => {
      if (pending === request) pending = null;
    };
    let loading: ReturnType<NonNullable<NavigationNode['onMore']>>;
    try {
      loading = registrations.get(groupId)?.node.onMore?.({
        edge,
        signal: request.controller.signal,
      });
    } catch (error) {
      failed();
      console.error(error);
      return;
    }
    // A loader returning nothing is done asking: a new press may ask again, while new content
    // registering still completes this move
    if (!loading) request.settled = true;
    else
      loading.then(() => {
        request.settled = true;
      }, failed);
  }

  function cancelPending() {
    if (!pending) return;
    pending.controller.abort();
    pending = null;
  }

  /** New content registered in the pending group: once the commit is over, try the move again. */
  function queueRetry() {
    if (retryQueued) return;
    retryQueued = true;
    queueMicrotask(() => {
      retryQueued = false;
      retryPending();
    });
  }

  function retryPending() {
    const request = pending;
    if (!request) return;
    // Only while the intent still matches: focus where the move started, the same overlay on top
    if (
      activeId !== request.fromId ||
      activePart !== request.part ||
      topScope() !== request.scopeId
    ) {
      cancelPending();
      return;
    }
    const resolution = resolveMove(tree(), request.fromId, request.direction, {
      scopeId: request.scopeId,
      part: request.part,
    });
    // Still nothing focusable past the edge: keep waiting
    if (
      resolution.type === 'pending' &&
      resolution.groupId === request.groupId &&
      resolution.edge === request.edge
    ) {
      return;
    }
    // Done; nothing to abort
    pending = null;
    if (resolution.type === 'move' || resolution.type === 'handled') {
      apply(resolution);
      last = { key: request.direction, resolution };
      anyListeners.forEach(listener => listener());
    }
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
    // Back is a new intent: a move waiting for content is dropped
    cancelPending();
    const editing = document.activeElement;
    if (!(editing instanceof HTMLElement) || !isEditable(editing)) return false;
    editing.blur();
    return true;
  }

  /** Tab and Shift+Tab: the eligible leaves of the topmost scope in document order. */
  function tab(backward: boolean): boolean {
    const view = tree();
    const scope = topScope();
    // Tab stops: each leaf, or each part of a composite that is its own native control (marked
    // with `data-nav-part`), in document order like native Tab
    const stops: { id: string; part: string | undefined; element: HTMLElement }[] = [];
    for (const [id, registration] of registrations) {
      const { node } = registration;
      if (node.kind !== 'leaf' || !view.eligible(id) || !isWithin(view, id, scope)) continue;
      const element = registration.element();
      if (!element) continue;
      const parts = node.parts ?? [];
      const marked = parts.map(part => partElement(element, part));
      if (marked.every(own => own === null)) {
        stops.push({ id, part: parts[0], element });
        continue;
      }
      // Unmarked parts stop at the leaf itself (before its marked parts, which it contains)
      parts.forEach((part, index) => {
        const own = marked[index];
        if (own === null) stops.push({ id, part, element });
        else if (!(own as HTMLButtonElement).disabled) stops.push({ id, part, element: own });
      });
    }
    if (stops.length === 0) return false;
    stops.sort((a, b) =>
      a.element === b.element
        ? 0
        : a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1
    );
    const exact = stops.findIndex(stop => stop.id === activeId && stop.part === activePart);
    const index = exact !== -1 ? exact : stops.findIndex(stop => stop.id === activeId);
    let next = index === -1 ? (backward ? stops.length - 1 : 0) : index + (backward ? -1 : 1);
    if (next < 0 || next >= stops.length) {
      // Only a containing scope traps Tab; a page lets it leave natively
      const contained = scope !== null && registrations.get(scope)?.node.edge === 'contain';
      if (!contained) return false;
      next = backward ? stops.length - 1 : 0;
    }
    const target = stops[next];
    // Keys took over: the pointer resting here is not movement, and no grid column is kept
    pointerAnchor = pointer;
    gridColumns.clear();
    setActive(target.id, target.part, 'key');
    // A desktop keyboard tabbing onto a field types into it: Tab enters edit mode
    const { element } = target;
    const field = isEditable(element)
      ? element
      : target.part === 'input'
        ? element.querySelector<HTMLElement>(editableSelector)
        : null;
    field?.focus({ preventScroll: true });
    return true;
  }

  /**
   * DOM focus arrived without the layer (a tap or click into a field, a browser autofill): the
   * leaf holding it becomes the focused one, at the part holding it (`data-nav-part`), or its
   * input part when the focus is in a text field.
   * Focus on an unregistered control clears virtual focus.
   */
  function domFocus(target: Element) {
    let found: { id: string; element: HTMLElement } | null = null;
    for (const [id, registration] of registrations) {
      if (registration.node.kind !== 'leaf') continue;
      const element = registration.element();
      // The innermost leaf holding the target
      if (element?.contains(target) && (!found || found.element.contains(element))) {
        found = { id, element };
      }
    }
    if (!found) {
      // A control outside the layer took focus (a panel still moving DOM focus itself): virtual
      // focus steps aside, so nothing else looks focused, and comes back when a leaf is focused
      if (activeId !== null && target instanceof HTMLElement && canMirror(target)) {
        setActive(null, undefined, 'pointer');
      }
      return;
    }
    const parts = registrations.get(found.id)!.node.parts;
    // A part that is its own native control (Tab or a click onto a field's reveal toggle)
    const partHolder = target.closest('[data-nav-part]');
    const marked =
      partHolder && found.element.contains(partHolder)
        ? partHolder.getAttribute('data-nav-part')
        : null;
    const part =
      marked && parts?.includes(marked)
        ? marked
        : isEditable(target) && parts?.includes('input')
          ? 'input'
          : found.id === activeId
            ? activePart
            : parts?.[0];
    if (found.id === activeId && part === activePart) return;
    const view = tree();
    if (!view.eligible(found.id) || !isWithin(view, found.id, topScope())) return;
    setActive(found.id, part, 'pointer');
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
    dropGeometryAbove(node.parent);
    if (pending && isWithin(tree(), node.id, pending.groupId)) queueRetry();

    return () => {
      if (registrations.get(node.id) !== registration) return;
      // The group a move waits on went away (a route change)
      if (pending?.groupId === node.id) cancelPending();
      // A group holding focus counts too: it may unregister before the focused leaf inside it,
      // which could then no longer walk up past it
      const wasActive = activeId !== null && isWithin(tree(), activeId, node.id);
      // Candidates while the DOM is still there (layout cleanups run before nodes are removed)
      const fallbacks = wasActive ? removalCandidates(node.id) : [];
      registrations.delete(node.id);
      childrenOf.get(node.parent)?.delete(node.id);
      dropGeometryAbove(node.parent);
      dropGeometry(node.id);
      if (!wasActive) return;
      const removedAt = generation;
      // After the whole commit: a closing scope restores its opener first
      queueMicrotask(() => {
        if (generation !== removedAt) return;
        const view = tree();
        // Remounted under the same id in the same commit (a layout switch): focus stays there
        if (
          activeId !== null &&
          registrations.has(activeId) &&
          view.eligible(activeId) &&
          isWithin(view, activeId, topScope())
        ) {
          const element = elementOf(activeId);
          const target = mirrorDomFocus && element ? mirrorTarget(element, activePart) : null;
          if (target && document.activeElement !== target) {
            target.focus({ preventScroll: true });
            mirrored = target;
          }
          notify([activeId]);
          return;
        }
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
    if (!registration) return;
    const previous = registration.node;
    const previousParts = previous.parts;
    registration.node = node;
    // Eligibility or arrangement changed: cached rectangles here and above (a group's union of
    // its eligible children) are stale
    if (
      previous.disabled !== node.disabled ||
      previous.layout !== node.layout ||
      previous.columns !== node.columns ||
      previous.span !== node.span
    ) {
      dropGeometry(node.id);
      dropGeometryAbove(node.parent);
    }
    // The pending group re-rendered: new parts, or `more` turned off
    if (pending?.groupId === node.id) queueRetry();
    // The focused part went away (a search's clear action once the field is empty): the part
    // before it, else the first
    if (
      activeId === node.id &&
      activePart !== undefined &&
      node.parts &&
      !node.parts.includes(activePart)
    ) {
      const index = previousParts?.indexOf(activePart) ?? 0;
      const kept = previousParts
        ?.slice(0, Math.max(0, index))
        .reverse()
        .find(part => node.parts!.includes(part));
      setActive(node.id, kept ?? node.parts[0], 'program');
    }
  }

  /** Opens an overlay scope above the others; the returned function closes it. */
  function pushScope(id: string): () => void {
    cancelPending();
    const view = tree();
    // A scope open from the start inside this one registered first; this one goes below it
    const descendant = scopes.findIndex(other => isWithin(view, other.id, id));
    const scope: Scope = {
      id,
      opener: descendant === -1 ? activeId : scopes[descendant].opener,
    };
    if (descendant === -1) scopes.push(scope);
    else scopes.splice(descendant, 0, scope);
    // An overlay opens fresh at its initial target: forget what was focused in it last time
    for (const groupId of [...memory.keys()]) {
      if (isWithin(view, groupId, id)) memory.delete(groupId);
    }
    return () => {
      const index = scopes.indexOf(scope);
      if (index === -1) return;
      cancelPending();
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
        // No opener (gone, or the overlay opened before anything had focus): the topmost scope
        // takes focus after the commit, once the page behind is no longer `inert`, unless the
        // removal fallback placed it first
        const closedAt = generation;
        queueMicrotask(() => {
          if (generation !== closedAt) return;
          if (!recover()) setActive(null, undefined, 'program');
        });
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
    domFocus,
    pointerFocus,
    lockPointer,
    trackPointer,
    pushScope,
    recover,
    invalidateGeometry,
    /** Stops watching element sizes (the provider unmounting). */
    dispose: () => {
      invalidateGeometry();
      resizeObserver?.disconnect();
    },
    /** Spatial groups with cached geometry, for the inspector and tests. */
    cachedGeometry: () => [...geometry.keys()],
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
        pending: pending && { groupId: pending.groupId, edge: pending.edge },
        geometry: [...geometry.keys()],
        nodes: [...registrations.values()].map(registration => registration.node),
        remembered: Object.fromEntries(memory),
      };
    },
  };
}

export type NavigationStore = ReturnType<typeof createNavigationStore>;
