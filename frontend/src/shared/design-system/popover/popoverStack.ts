/** Open popovers, innermost last: only the topmost one answers Back. */
const stack: symbol[] = [];

export function pushPopover(id: symbol): () => void {
  stack.push(id);
  return () => {
    const index = stack.indexOf(id);
    if (index !== -1) stack.splice(index, 1);
  };
}

export function isTopPopover(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}
