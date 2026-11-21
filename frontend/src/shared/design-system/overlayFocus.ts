/** Focus helpers shared by the overlays (Dialog, Popover). */

const tabbable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** What Tab can actually reach: rendered, not inert or hidden, and not taken out of the order. */
const reachable = (element: HTMLElement) =>
  element.tabIndex >= 0 &&
  !element.closest('[inert], [hidden]') &&
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== 'hidden';

/** Tab and Shift+Tab cycle inside `panel` (desktop keyboards; TV remotes have no Tab). */
export function containTab(event: KeyboardEvent, panel: HTMLElement) {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(tabbable)).filter(reachable);
  if (items.length === 0) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !panel.contains(active);
  if (event.shiftKey && (outside || active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (outside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

/** Inputs that hold DOM focus without typing: Back still closes the overlay they are in. */
const NOT_TYPED = new Set([
  'checkbox',
  'radio',
  'range',
  'button',
  'submit',
  'reset',
  'color',
  'file',
  'image',
]);

/** A text field is in edit mode: Back leaves the edit layer before it closes anything. */
export const isEditing = () => {
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && !NOT_TYPED.has(active.type))
  );
};
