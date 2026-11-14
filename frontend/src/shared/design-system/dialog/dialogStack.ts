/**
 * Open dialogs, innermost last. The stack is the single owner of what modality changes on the page:
 * only the topmost dialog handles Back and Tab, the body's scroll lock is taken by the first dialog
 * and released by the last, and everything outside the topmost dialog is `inert` (no pointer, no
 * Tab, hidden from assistive technology), including body children added while a dialog is open.
 * Elements that were already inert are left alone.
 */
interface OpenDialog {
  id: symbol;
  /** The dialog's portal root, a child of `document.body`. */
  root: HTMLElement | null;
}

const stack: OpenDialog[] = [];
/** Each open dialog's enclosing dialog, so a nested dialog stays above it whatever the order. */
const parents = new Map<symbol, symbol | undefined>();
let savedOverflow: string | null = null;
/** What had DOM focus before the first dialog opened, restored when the last one closes. */
let opener: Element | null = null;
/** Elements this module made inert, so only those are released. */
const madeInert = new Set<Element>();
let observer: MutationObserver | null = null;

function makeInert(element: Element) {
  if (element === stack[stack.length - 1]?.root || element.hasAttribute('inert')) return;
  element.setAttribute('inert', '');
  madeInert.add(element);
}

function updateModality() {
  for (const element of madeInert) element.removeAttribute('inert');
  madeInert.clear();
  const top = stack[stack.length - 1];
  if (!top) {
    observer?.disconnect();
    observer = null;
    if (savedOverflow !== null) document.body.style.overflow = savedOverflow;
    savedOverflow = null;
    return;
  }
  if (savedOverflow === null) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  for (const child of Array.from(document.body.children)) makeInert(child);
  // A dialog's own root arrives before its push, which then releases it
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element && node.parentElement === document.body) makeInert(node);
        }
      }
    });
    observer.observe(document.body, { childList: true });
  }
}

const isDescendant = (id: symbol, ancestor: symbol) => {
  for (let parent = parents.get(id); parent; parent = parents.get(parent)) {
    if (parent === ancestor) return true;
  }
  return false;
};

/**
 * Registers an open dialog, above every other one except its own nested dialogs (React runs a
 * child's effects before its parent's, so a nested dialog open from the start registers first).
 * Returns the removal, which gives back the original opener when the last dialog closes.
 */
export function pushDialog(
  id: symbol,
  root: HTMLElement | null,
  parent?: symbol
): () => Element | null {
  if (stack.length === 0) opener = document.activeElement;
  parents.set(id, parent);
  const firstNested = stack.findIndex(entry => isDescendant(entry.id, id));
  stack.splice(firstNested === -1 ? stack.length : firstNested, 0, { id, root });
  updateModality();
  return () => {
    const index = stack.findIndex(entry => entry.id === id);
    if (index !== -1) stack.splice(index, 1);
    parents.delete(id);
    updateModality();
    if (stack.length > 0) return null;
    const original = opener;
    opener = null;
    return original;
  };
}

export function isTopDialog(id: symbol): boolean {
  return stack[stack.length - 1]?.id === id;
}

/** The topmost dialog's portal root, or `null` when none is open. */
export function topDialogRoot(): HTMLElement | null {
  return stack[stack.length - 1]?.root ?? null;
}
