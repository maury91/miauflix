/** A text-editing element: DOM focus there means edit mode (caret, IME). */
export function isEditable(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return (
    element instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'].includes(
      element.type
    )
  );
}

/** Whether an element can take focus now: connected, laid out, not inert, hidden or disabled. */
export function isShown(element: HTMLElement): boolean {
  return (
    element.isConnected &&
    !(element as HTMLButtonElement).disabled &&
    !element.closest('[inert], [aria-hidden="true"]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden'
  );
}

/** Elements DOM focus can mirror virtual focus onto without entering edit mode. */
export function canMirror(element: HTMLElement): boolean {
  if (isEditable(element) || element instanceof HTMLSelectElement) return false;
  return element.tabIndex >= 0 || element instanceof HTMLButtonElement;
}

/**
 * Where DOM focus mirrors virtual focus: in a composite the part's element (`data-nav-part`), else
 * the registered element; either itself when it can take focus, else its only focusable control (a
 * choice's checkbox, a slider's range, a carousel slot's tile). Null when nothing can take it
 * without entering edit mode.
 */
export function mirrorTarget(element: HTMLElement, part: string | undefined): HTMLElement | null {
  if (part === undefined || canMirror(element)) return soleControl(element);
  const marked = Array.from(element.querySelectorAll<HTMLElement>('[data-nav-part]')).find(
    candidate => candidate.dataset['navPart'] === part
  );
  return marked ? soleControl(marked) : null;
}

function soleControl(element: HTMLElement): HTMLElement | null {
  if (canMirror(element)) return element;
  const controls = Array.from(
    element.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]')
  ).filter(control => canMirror(control) && !(control as HTMLButtonElement).disabled);
  return controls.length === 1 ? controls[0] : null;
}

/** A native control that keeps DOM focus once focused: a select, or a non-text input. */
export function isNativeControl(element: Element): boolean {
  return element instanceof HTMLSelectElement || element instanceof HTMLInputElement;
}

const editableSelector =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]';

/**
 * Confirm on the focused element, through the same path as the pointer: a field enters edit mode
 * (DOM focus on its input, which opens the TV's keyboard), a select opens its picker, anything else
 * is clicked once. A composite activates its focused part (`data-focused` inside it).
 */
export function activate(element: HTMLElement): boolean {
  const target =
    element.hasAttribute('data-focused') || !element.querySelector('[data-focused]')
      ? element
      : (element.querySelector<HTMLElement>('[data-focused]') ?? element);
  const editable = isEditable(target)
    ? target
    : target.querySelector<HTMLElement>(editableSelector);
  if (editable && !(target instanceof HTMLButtonElement)) {
    editable.focus({ preventScroll: true });
    return true;
  }
  const picker = target instanceof HTMLSelectElement ? target : target.querySelector('select');
  if (picker && !(target instanceof HTMLButtonElement)) {
    try {
      picker.showPicker();
    } catch {
      // Older engines, or no user activation
      picker.focus({ preventScroll: true });
    }
    return true;
  }
  // A choice toggles through its native control
  const choice = target.querySelector<HTMLInputElement>(
    'input[type="checkbox"], input[type="radio"]'
  );
  if (choice && !(target instanceof HTMLButtonElement)) {
    choice.click();
    return true;
  }
  // A wrapper (a carousel slot) activates the action inside it
  const interactive = target.matches(
    'button, a[href], input, select, textarea, label, [role="button"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"]'
  );
  const inner = interactive ? null : target.querySelector<HTMLElement>('button, a[href]');
  (inner ?? target).click();
  return true;
}
