/**
 * Open popovers, innermost last: only the topmost one answers Back. Order follows nesting, not the
 * order popovers registered in: a nested popover open from the start registers before its parent
 * (React runs a child's effects first), yet stays above it.
 */
const stack: symbol[] = [];
/** Each open popover's enclosing popover. */
const parents = new Map<symbol, symbol | undefined>();

function isDescendant(id: symbol, ancestor: symbol): boolean {
  for (let parent = parents.get(id); parent; parent = parents.get(parent)) {
    if (parent === ancestor) return true;
  }
  return false;
}

export function pushPopover(id: symbol, parent?: symbol): () => void {
  parents.set(id, parent);
  // Below any popover nested in this one that is already open
  const firstNested = stack.findIndex(other => isDescendant(other, id));
  stack.splice(firstNested === -1 ? stack.length : firstNested, 0, id);
  return () => {
    const index = stack.indexOf(id);
    if (index !== -1) stack.splice(index, 1);
    parents.delete(id);
  };
}

export function isTopPopover(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}
