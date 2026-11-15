import { gridLayout, stepGrid } from './grid';
import type {
  Direction,
  GridMemo,
  NavigationNode,
  NavigationTree,
  Rect,
  Resolution,
} from './types';

const isInline = (direction: Direction) => direction === 'left' || direction === 'right';

/** Whether `id` is `ancestorId` or inside it. */
export function isWithin(tree: NavigationTree, id: string, ancestorId: string | null): boolean {
  if (ancestorId === null) return true;
  // By parent IDs: an ancestor unregistering in the same commit still counts
  for (let current: string | null = id; current !== null; ) {
    if (current === ancestorId) return true;
    current = tree.node(current)?.parent ?? null;
  }
  return false;
}

/** Toward the end of a group's order: Right (Left in right-to-left text) or Down. */
function towardEnd(tree: NavigationTree, groupId: string, direction: Direction): boolean {
  if (isInline(direction)) return (direction === 'right') !== tree.rtl(groupId);
  return direction === 'down';
}

/**
 * The candidate a direction reaches by geometry (style guide, section 10, step 8): those lying in
 * that direction; first the ones in the focused element's beam (overlapping on the cross axis),
 * nearest first; otherwise the smallest gap plus twice the cross-axis distance, so an item off to
 * the side loses to one roughly in line. Document order (the order given) breaks ties.
 */
export function spatialPick(
  from: Rect,
  candidates: readonly { id: string; rect: Rect }[],
  direction: Direction
): string | null {
  const scored = candidates
    .map(({ id, rect }, order) => {
      const inline = isInline(direction);
      const gap = inline
        ? direction === 'right'
          ? rect.left - from.right
          : from.left - rect.right
        : direction === 'down'
          ? rect.top - from.bottom
          : from.top - rect.bottom;
      const [start, end, fromStart, fromEnd] = inline
        ? [rect.top, rect.bottom, from.top, from.bottom]
        : [rect.left, rect.right, from.left, from.right];
      const overlap = Math.min(end, fromEnd) - Math.max(start, fromStart);
      const crossGap = Math.max(0, start - fromEnd, fromStart - end);
      return { id, gap: Math.max(0, gap), rawGap: gap, overlap, crossGap, order };
    })
    // A pixel of slack for adjacent boxes measured with fractions
    .filter(candidate => candidate.rawGap >= -1);
  if (scored.length === 0) return null;
  const beam = scored.filter(candidate => candidate.overlap > 0);
  if (beam.length > 0) {
    beam.sort((a, b) => a.gap - b.gap || b.overlap - a.overlap || a.order - b.order);
    return beam[0].id;
  }
  scored.sort((a, b) => a.gap + 2 * a.crossGap - (b.gap + 2 * b.crossGap) || a.order - b.order);
  return scored[0].id;
}

/** The part a composite is entered at: the near end along the move. */
function entryPart(tree: NavigationTree, node: NavigationNode, direction: Direction | null) {
  const parts = node.parts;
  if (!parts || parts.length === 0) return undefined;
  if (direction && isInline(direction) && !towardEnd(tree, node.id, direction)) {
    return parts[parts.length - 1];
  }
  return parts[0];
}

export interface Entry {
  id: string;
  part?: string;
}

/**
 * The leaf focus lands on entering a node, by its entry policy (see EntryPolicy), coming from
 * `fromRect` in `direction` (both null for an initial focus). Null when nothing inside is eligible.
 */
export function enter(
  tree: NavigationTree,
  id: string,
  direction: Direction | null,
  fromRect: Rect | null
): Entry | null {
  const node = tree.node(id);
  if (!node || !tree.eligible(id)) return null;
  if (node.kind === 'leaf') return { id, part: entryPart(tree, node, direction) };

  const policy = node.entry ?? 'remembered';
  const children = tree.children(id).filter(child => tree.eligible(child));
  if (children.length === 0) return null;
  const into = (target: string) => enter(tree, target, direction, fromRect);

  if (policy === 'remembered') {
    const remembered = tree.remembered(id);
    if (remembered && tree.eligible(remembered) && isWithin(tree, remembered, id)) {
      return { id: remembered, part: entryPart(tree, tree.node(remembered)!, direction) };
    }
  }
  if (policy !== 'first') {
    const selected = children.find(child => tree.node(child)?.selected);
    if (selected) return into(selected);
  }
  if (node.defaultId && tree.eligible(node.defaultId) && isWithin(tree, node.defaultId, id)) {
    return into(node.defaultId);
  }
  if (policy !== 'first' && direction) {
    // Along the group's own axis it is entered at the near end
    const along =
      (node.layout === 'horizontal' && isInline(direction)) ||
      (node.layout === 'vertical' && !isInline(direction));
    if (along) {
      return into(towardEnd(tree, id, direction) ? children[0] : children[children.length - 1]);
    }
    if (fromRect) {
      const candidates = children.flatMap(child => {
        const rect = tree.rect(child);
        return rect ? [{ id: child, rect }] : [];
      });
      const aligned = spatialPick(fromRect, candidates, direction);
      if (aligned) return into(aligned);
    }
  }
  return into(children[0]);
}

interface Step {
  id: string;
  gridColumn?: GridMemo;
}

/** The sibling a direction reaches inside a group, or null at its edge. */
function stepInGroup(
  tree: NavigationTree,
  group: NavigationNode,
  childId: string,
  direction: Direction,
  fromRect: Rect | null
): Step | null {
  const children = tree.children(group.id);
  const index = children.indexOf(childId);
  if (index === -1) return null;
  const layout = group.layout ?? 'vertical';

  if (layout === 'horizontal' || layout === 'vertical') {
    if ((layout === 'horizontal') !== isInline(direction)) return null;
    const step = towardEnd(tree, group.id, direction) ? 1 : -1;
    for (let next = index + step; next >= 0 && next < children.length; next += step) {
      if (tree.eligible(children[next])) return { id: children[next] };
    }
    if (group.edge === 'wrap') {
      for (let next = step > 0 ? 0 : children.length - 1; next !== index; next += step) {
        if (tree.eligible(children[next])) return { id: children[next] };
      }
    }
    return null;
  }

  if (layout === 'grid') {
    const cells = gridLayout(
      children.map(child => tree.node(child)?.span ?? 1),
      group.columns ?? 1
    );
    const rtl = tree.rtl(group.id);
    const column = isInline(direction) ? undefined : tree.gridColumn(group.id);
    let next = stepGrid(cells, index, direction, { rtl, column });
    while (next !== null && !tree.eligible(children[next])) {
      next = stepGrid(cells, next, direction, { rtl, column });
    }
    if (next === null) return null;
    const kept = isInline(direction) ? cells[next].column : (column ?? cells[index].column);
    return { id: children[next], gridColumn: { groupId: group.id, column: kept } };
  }

  // Spatial: by the rectangles of the eligible siblings
  if (!fromRect) return null;
  const candidates = children.flatMap(child => {
    if (child === childId || !tree.eligible(child)) return [];
    const rect = tree.rect(child);
    return rect ? [{ id: child, rect }] : [];
  });
  const picked = spatialPick(fromRect, candidates, direction);
  return picked ? { id: picked } : null;
}

export interface ResolveOptions {
  /** The topmost scope: candidates never lie outside it. */
  scopeId: string | null;
  /** The focused part of a composite leaf. */
  part?: string;
}

/**
 * Resolves a direction from the focused leaf (style guide, section 10, steps 4 to 9): composite
 * parts, explicit overrides, siblings by the group's layout, then each edge's policy, bubbling up
 * to the topmost scope. Never blurs: with no target focus stays.
 */
export function resolveMove(
  tree: NavigationTree,
  fromId: string,
  direction: Direction,
  { scopeId, part }: ResolveOptions
): Resolution {
  const from = tree.node(fromId);
  if (!from) return { type: 'unhandled', reason: `${fromId} is not registered` };
  const fromRect = tree.rect(fromId);

  // Component-intrinsic: a composite moves between its parts before anything else
  if (from.parts && part !== undefined && isInline(direction)) {
    const index = from.parts.indexOf(part);
    const next = index + (towardEnd(tree, fromId, direction) ? 1 : -1);
    if (index !== -1 && next >= 0 && next < from.parts.length) {
      return { type: 'handled', part: from.parts[next], reason: `part ${from.parts[next]}` };
    }
  }

  let child: NavigationNode = from;
  for (;;) {
    const override = child.overrides?.[direction];
    if (override !== undefined) {
      if (isWithin(tree, override, scopeId)) {
        const entry = enter(tree, override, direction, fromRect);
        if (entry)
          return { type: 'move', targetId: entry.id, part: entry.part, reason: 'override' };
      }
      // An ineligible or out-of-scope override falls back to the normal rules
    }
    if (child.parent === null) {
      return { type: 'unhandled', reason: `edge of root ${child.id}` };
    }
    const group = tree.node(child.parent);
    if (!group) return { type: 'unhandled', reason: `${child.parent} is not registered` };

    const step = stepInGroup(tree, group, child.id, direction, fromRect);
    if (step) {
      const entry = enter(tree, step.id, direction, fromRect);
      if (entry) {
        return {
          type: 'move',
          targetId: entry.id,
          part: entry.part,
          reason: `${group.layout ?? 'vertical'} step in ${group.id}`,
          gridColumn: step.gridColumn,
        };
      }
    }
    const contain = group.edge === 'contain';
    if (contain) return { type: 'blocked', reason: `${group.id} contains` };
    if (group.id === scopeId) return { type: 'unhandled', reason: `edge of scope ${group.id}` };
    child = group;
  }
}
