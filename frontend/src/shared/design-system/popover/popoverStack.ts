/**
 * Open popovers, innermost last: only the topmost one answers Back. Order follows nesting, not the
 * order popovers registered in: a nested popover open from the start registers before its parent
 * (React runs a child's effects first), yet stays above it.
 */
const stack: symbol[] = [];
/** Each open popover's enclosing popover. */
const parents = new Map<symbol, symbol | undefined>();
/** Each open popover's panel: a sheet's is drawn elsewhere, outside its parent's DOM. */
const panels = new Map<symbol, HTMLElement>();

function isDescendant(id: symbol, ancestor: symbol): boolean {
  for (let parent = parents.get(id); parent; parent = parents.get(parent)) {
    if (parent === ancestor) return true;
  }
  return false;
}

export function pushPopover(id: symbol, parent?: symbol, panel?: HTMLElement | null): () => void {
  parents.set(id, parent);
  if (panel) panels.set(id, panel);
  // Below any popover nested in this one that is already open
  const firstNested = stack.findIndex(other => isDescendant(other, id));
  stack.splice(firstNested === -1 ? stack.length : firstNested, 0, id);
  return () => {
    const index = stack.indexOf(id);
    if (index !== -1) stack.splice(index, 1);
    parents.delete(id);
    panels.delete(id);
  };
}

/** Whether `target` is in a popover nested in `id`, wherever that one's panel is drawn. */
export function isInNestedPopover(id: symbol, target: Node): boolean {
  for (const [other, panel] of panels) {
    if (isDescendant(other, id) && panel.contains(target)) return true;
  }
  return false;
}

export function isTopPopover(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}
