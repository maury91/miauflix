/** Open dialogs, innermost last: only the topmost handles Back. */
const stack: symbol[] = [];

export function pushDialog(id: symbol): () => void {
  stack.push(id);
  return () => {
    const index = stack.lastIndexOf(id);
    if (index !== -1) stack.splice(index, 1);
  };
}

export function isTopDialog(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}
