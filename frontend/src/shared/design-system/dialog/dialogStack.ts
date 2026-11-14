/**
 * Open dialogs, innermost last. The stack is the single owner of what modality changes on the page:
 * only the topmost dialog handles Back and Tab, the body's scroll lock is taken by the first dialog
 * and released by the last, and everything outside the topmost dialog is `inert` (no pointer, no
 * Tab, hidden from assistive technology). Elements that were already inert are left alone.
 */
interface OpenDialog {
  id: symbol;
  /** The dialog's portal root, a child of `document.body`. */
  root: HTMLElement | null;
}

const stack: OpenDialog[] = [];
let savedOverflow: string | null = null;
/** Elements this module made inert, so only those are released. */
const madeInert = new Set<Element>();

function updateModality() {
  for (const element of madeInert) element.removeAttribute('inert');
  madeInert.clear();
  const top = stack[stack.length - 1];
  if (!top) {
    if (savedOverflow !== null) document.body.style.overflow = savedOverflow;
    savedOverflow = null;
    return;
  }
  if (savedOverflow === null) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  for (const child of Array.from(document.body.children)) {
    if (child === top.root || child.hasAttribute('inert')) continue;
    child.setAttribute('inert', '');
    madeInert.add(child);
  }
}

export function pushDialog(id: symbol, root: HTMLElement | null): () => void {
  stack.push({ id, root });
  updateModality();
  return () => {
    const index = stack.findIndex(entry => entry.id === id);
    if (index !== -1) stack.splice(index, 1);
    updateModality();
  };
}

export function isTopDialog(id: symbol): boolean {
  return stack[stack.length - 1]?.id === id;
}

/** The topmost dialog's portal root, or `null` when none is open. */
export function topDialogRoot(): HTMLElement | null {
  return stack[stack.length - 1]?.root ?? null;
}
