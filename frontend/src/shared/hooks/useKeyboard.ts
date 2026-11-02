import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';

/** What a key means to the app, whether it came from a keyboard or a TV remote. */
export type KeyboardAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'confirm'
  | 'back'
  | 'search'
  | 'playPause'
  | 'play'
  | 'pause';

export type KeyboardHandler = (event: KeyboardEvent) => boolean;

export type KeyboardHandlers = {
  onLeft?: KeyboardHandler;
  onRight?: KeyboardHandler;
  onUp?: KeyboardHandler;
  onDown?: KeyboardHandler;
  onConfirm?: KeyboardHandler;
  onBack?: KeyboardHandler;
  /** The remote's Search key. */
  onSearch?: KeyboardHandler;
  /** The media keys: Play/Pause, Play and Pause. */
  onPlayPause?: KeyboardHandler;
  onPlay?: KeyboardHandler;
  onPause?: KeyboardHandler;
};

export type KeyboardOptions = KeyboardHandlers & {
  enabled?: boolean;
  /** Capture keyboard input even when focus is outside this scope (for dialogs). */
  exclusive?: boolean;
  /**
   * Put focus back on this scope's default item when a direction key arrives while nothing is
   * focused (a focused control was disabled or removed). Return true once focus is restored.
   */
  onRestoreFocus?: () => boolean;
};

export type KeyboardScope = {
  /** Keys whose target is inside this element; null for the whole page. */
  element: HTMLElement | null;
  options: MutableRefObject<KeyboardOptions>;
};

const HANDLERS: Record<KeyboardAction, keyof KeyboardHandlers> = {
  left: 'onLeft',
  right: 'onRight',
  up: 'onUp',
  down: 'onDown',
  confirm: 'onConfirm',
  back: 'onBack',
  search: 'onSearch',
  playPause: 'onPlayPause',
  play: 'onPlay',
  pause: 'onPause',
};

/**
 * TV remote keys that some platforms report as `Unidentified`, by key code: Tizen Return,
 * Search and the media keys (registered at Tizen startup), and webOS Back.
 */
const TV_KEY_CODES: Readonly<Record<number, KeyboardAction>> = {
  10009: 'back',
  10225: 'search',
  10252: 'playPause',
  415: 'play',
  19: 'pause',
  461: 'back',
};

/** Map keyboard and remote-control key names to actions, or null for an unrecognized key. */
export function getKeyAction(key: string): KeyboardAction | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Enter':
    case ' ':
      return 'confirm';
    case 'Escape':
    case 'Backspace':
    case 'Back':
    case 'BrowserBack':
    case 'GoBack':
      return 'back';
    case 'Search':
    case 'BrowserSearch':
      return 'search';
    case 'MediaPlayPause':
      return 'playPause';
    case 'MediaPlay':
      return 'play';
    case 'MediaPause':
      return 'pause';
    default:
      return null;
  }
}

/** The action for a key event, by key name or, for TV remotes, by key code. */
export function getKeyboardAction(event: KeyboardEvent): KeyboardAction | null {
  return getKeyAction(event.key) ?? TV_KEY_CODES[event.keyCode] ?? null;
}

const scopes = new Set<KeyboardScope>();

const DIRECTIONS: ReadonlySet<KeyboardAction> = new Set(['up', 'down', 'left', 'right']);
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * The element that last held focus, tracked here rather than read back from the DOM: when a
 * focused control is disabled or removed the browser moves focus to the body, but this remembers
 * where the user was.
 */
let lastFocused: HTMLElement | null = null;
const rememberFocus = (event: FocusEvent) => {
  if (event.target instanceof HTMLElement) lastFocused = event.target;
};

/** Whether focus was lost: on the page body, or on an element that left the document. */
function hasNoFocus(): boolean {
  const active = document.activeElement;
  return (
    !active ||
    active === document.body ||
    active === document.documentElement ||
    !active.isConnected
  );
}

/** Whether an element is on screen and interactive (not inert, hidden, or undisplayed). */
function isShown(element: Element): boolean {
  return (
    element.isConnected &&
    !element.closest('[inert], [aria-hidden="true"]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden'
  );
}

/** Focus a container's `[data-default-focus]` element, else its first focusable one. */
function focusDefaultIn(container: Element): boolean {
  const target =
    Array.from(container.querySelectorAll<HTMLElement>('[data-default-focus]')).find(isShown) ??
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).find(isShown);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return !hasNoFocus();
}

/**
 * Give focus back to the page after it was lost, so the remote keeps working: the element that
 * last had it when it is still on screen and enabled, else dialogs first,
 * then the innermost scope that can restore its own default item, then the outermost scopes'
 * first focusable element, and finally the page's main content.
 */
function restoreFocus(): boolean {
  const last = lastFocused;
  if (last && isShown(last) && !(last as HTMLButtonElement).disabled) {
    last.focus({ preventScroll: true });
    if (!hasNoFocus()) return true;
  }
  const shown = [...scopes]
    .filter(
      scope => scope.options.current.enabled !== false && (!scope.element || isShown(scope.element))
    )
    // Newest first, so a page that just opened wins over one that is leaving.
    .reverse();
  const restore = (scope: KeyboardScope) =>
    scope.options.current.onRestoreFocus
      ? scope.options.current.onRestoreFocus()
      : !!scope.element && focusDefaultIn(scope.element);

  for (const scope of shown) {
    if (scope.options.current.exclusive && restore(scope)) return true;
  }
  const withElement = shown.filter(scope => scope.element && !scope.options.current.exclusive);
  const depth = (element: Element) => {
    let count = 0;
    for (let node = element.parentElement; node; node = node.parentElement) count++;
    return count;
  };
  const innermostFirst = [...withElement].sort((a, b) => depth(b.element!) - depth(a.element!));
  for (const scope of innermostFirst) {
    if (scope.options.current.onRestoreFocus?.()) return true;
  }
  for (const scope of withElement) {
    const outermost = !withElement.some(
      other => other !== scope && other.element!.contains(scope.element)
    );
    if (outermost && !scope.options.current.onRestoreFocus && restore(scope)) return true;
  }
  for (const scope of shown) {
    if (!scope.element && scope.options.current.onRestoreFocus?.()) return true;
  }
  const main = Array.from(document.querySelectorAll('main')).find(isShown);
  return focusDefaultIn(main ?? document.body);
}
let listening = false;

/** Identify text-editable elements and native inputs, textareas, or selects whose keys need native handling. */
function isNativeEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Route keys through enabled scopes, prioritizing exclusive scopes and nested elements.
 * Skip prevented/composing events and Alt/Ctrl/Meta combinations. Editing targets keep their
 * typing keys; remote-only actions (Search, the media keys, and back other than Backspace) still
 * reach the app.
 * The first true result consumes the event.
 */
function dispatch(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
    return;

  const action = getKeyboardAction(event);
  if (!action) return;
  const remoteOnly =
    action === 'search' ||
    action === 'playPause' ||
    action === 'play' ||
    action === 'pause' ||
    (action === 'back' && event.key !== 'Backspace');
  if (isNativeEditingTarget(event.target) && !remoteOnly) return;

  // A direction key with nothing focused only brings the focus back.
  if (DIRECTIONS.has(action) && hasNoFocus() && restoreFocus()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const target = event.target instanceof Node ? event.target : document.activeElement;
  const matching = [...scopes]
    .filter(
      scope =>
        scope.options.current.enabled !== false &&
        (scope.options.current.exclusive || !scope.element || scope.element.contains(target))
    )
    .sort((a, b) => {
      if (a.options.current.exclusive !== b.options.current.exclusive)
        return a.options.current.exclusive ? -1 : 1;
      // Page-wide scopes come after every element scope.
      if (!a.element || !b.element) return a.element ? -1 : b.element ? 1 : 0;
      if (a.element === b.element) return 0;
      return a.element.contains(b.element) ? 1 : -1;
    });

  for (const scope of matching) {
    const handler = scope.options.current[HANDLERS[action]];
    if (handler?.(event) === true) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
}

/** Register a scope with the shared key listener and return cleanup that removes the listener when unused. */
export function registerKeyboardScope(scope: KeyboardScope): () => void {
  scopes.add(scope);
  if (!listening) {
    document.addEventListener('keydown', dispatch, true);
    document.addEventListener('focusin', rememberFocus, true);
    listening = true;
  }
  return () => {
    scopes.delete(scope);
    if (listening && scopes.size === 0) {
      document.removeEventListener('keydown', dispatch, true);
      document.removeEventListener('focusin', rememberFocus, true);
      lastFocused = null;
      listening = false;
    }
  };
}

/**
 * Handle keys anywhere on the page (app-wide shortcuts such as the remote's Search key). These
 * handlers run after every element scope from `useKeyboardNavigation`, so a focused page can
 * still claim a key first. Handlers return true to consume the key; options update in place.
 */
export function useKeyboard(options: KeyboardOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => registerKeyboardScope({ element: null, options: optionsRef }), []);
}
