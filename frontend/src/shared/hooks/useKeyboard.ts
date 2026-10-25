import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';

/** What a key means to the app, whether it came from a keyboard or a TV remote. */
export type KeyboardAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back' | 'search';

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
};

export type KeyboardOptions = KeyboardHandlers & {
  enabled?: boolean;
  /** Capture keyboard input even when focus is outside this scope (for dialogs). */
  exclusive?: boolean;
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
};

/**
 * TV remote keys that some platforms report as `Unidentified`, by key code: Tizen Return and
 * Search (registered at Tizen startup), and webOS Back.
 */
const TV_KEY_CODES: Readonly<Record<number, KeyboardAction>> = {
  10009: 'back',
  10225: 'search',
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
    default:
      return null;
  }
}

/** The action for a key event, by key name or, for TV remotes, by key code. */
export function getKeyboardAction(event: KeyboardEvent): KeyboardAction | null {
  return getKeyAction(event.key) ?? TV_KEY_CODES[event.keyCode] ?? null;
}

const scopes = new Set<KeyboardScope>();
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
 * typing keys; remote-only actions (Search, and back other than Backspace) still reach the app.
 * The first true result consumes the event.
 */
function dispatch(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
    return;

  const action = getKeyboardAction(event);
  if (!action) return;
  const remoteOnly = action === 'search' || (action === 'back' && event.key !== 'Backspace');
  if (isNativeEditingTarget(event.target) && !remoteOnly) return;

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
    listening = true;
  }
  return () => {
    scopes.delete(scope);
    if (listening && scopes.size === 0) {
      document.removeEventListener('keydown', dispatch, true);
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
