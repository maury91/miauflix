export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * How a group's children are arranged: along one axis, on logical grid coordinates (`columns` and
 * each child's `span`), or by their rectangles (`spatial`, measured only when moving).
 */
export type GroupLayout = 'horizontal' | 'vertical' | 'grid' | 'spatial';

/**
 * At a group's edge: `bubble` hands the direction to the parent (normal groups), `contain` stops
 * there (overlays), `wrap` goes round to the other end (opt-in, axis groups only).
 */
export type EdgePolicy = 'bubble' | 'contain' | 'wrap';

/**
 * Where focus lands entering a group. `remembered` (default): the descendant focused there last
 * while it is still eligible, else the selected child, the default, the child nearest to where
 * focus came from, the first. `aligned` skips the memory; `first` takes the default or first.
 */
export type EntryPolicy = 'remembered' | 'aligned' | 'first';

export type NodeKind = 'leaf' | 'group' | 'scope';

export interface NavigationNode {
  id: string;
  /** The enclosing group or scope; null for a root scope. */
  parent: string | null;
  kind: NodeKind;
  /** Groups and scopes: how the children are arranged. */
  layout?: GroupLayout;
  /** Grid groups: the column count in force (resolve a responsive one with `useWindowClass`). */
  columns?: number;
  /** Children of a grid group: columns spanned. */
  span?: number;
  edge?: EdgePolicy;
  entry?: EntryPolicy;
  /** Groups and scopes: the child or descendant entered by default. */
  defaultId?: string;
  /** A child marked as the selected one (the current tab, the active filter), entered first. */
  selected?: boolean;
  /** Explicit cross-region links, used sparingly; validated for eligibility and scope. */
  overrides?: Partial<Record<Direction, string>>;
  disabled?: boolean;
  /** Composite leaves: internal parts along the inline axis (input, then its actions). */
  parts?: readonly string[];
  /**
   * A composite's own stepping (a carousel paging through items): the part one step toward the
   * end (1) or the start (-1), or null at its edge. Called once per key; it may update the
   * composite's own state. Defaults to the neighbouring part.
   */
  stepPart?: (part: string, step: 1 | -1) => string | null;
  /** The part a composite is entered at (a carousel's kept item); defaults to the near end. */
  entryPart?: () => string | undefined;
  /**
   * Axis and grid groups, and composites: content past an edge that is not mounted yet (the next
   * page of a row). A move reaching that edge is `pending` instead of leaving.
   */
  more?: Partial<Record<Edge, boolean>>;
  /**
   * Loads the content past `request.edge`, once per pending move. Stop when `request.signal`
   * aborts (the user moved on). A returned promise settling lets the next press ask again (after
   * a failure, or a page that brought nothing focusable); content arriving after the user moved
   * on never takes focus.
   */
  onMore?: (request: MoreRequest) => Promise<unknown> | void;
}

/** A group's start or end, along its axis (mirrored for right-to-left text). */
export type Edge = 'start' | 'end';

export interface MoreRequest {
  edge: Edge;
  signal: AbortSignal;
}

export interface Rect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The result of a key: `move` to a leaf, `handled` inside the focused element (a composite part),
 * `blocked` by a containing boundary (it never reaches background handlers), `pending` on content
 * past a group's edge that is still loading (see NavigationNode.more), or `unhandled` (the owning
 * feature may act).
 */
export type Resolution =
  | { type: 'move'; targetId: string; part?: string; reason: string; gridColumn?: GridMemo }
  | { type: 'handled'; part: string; reason: string }
  | { type: 'blocked'; reason: string }
  | { type: 'pending'; groupId: string; edge: Edge; reason: string }
  | { type: 'unhandled'; reason: string };

/** The column a grid keeps aligned with across vertical moves (so a wide key doesn't pull it). */
export interface GridMemo {
  groupId: string;
  column: number;
}

/** What the resolver reads; the store backs it with the registry and the DOM. */
export interface NavigationTree {
  node(id: string): NavigationNode | undefined;
  /** Registered children, in document order. */
  children(id: string): readonly string[];
  /** A leaf that can take focus, or a group with such a leaf inside. */
  eligible(id: string): boolean;
  rect(id: string): Rect | null;
  rtl(id: string): boolean;
  /** The leaf last focused inside a group. */
  remembered(groupId: string): string | undefined;
  gridColumn(groupId: string): number | undefined;
}
