import type { MutableRefObject, RefCallback } from 'react';
import { useCallback, useRef } from 'react';

export type KeyboardNavigationAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back';

export type KeyboardNavigationHandler = (event: KeyboardEvent) => boolean;

export type KeyboardNavigationOptions = {
  enabled?: boolean;
  /** Capture keyboard input even when focus is outside this scope (for dialogs). */
  exclusive?: boolean;
  onLeft?: KeyboardNavigationHandler;
  onRight?: KeyboardNavigationHandler;
  onUp?: KeyboardNavigationHandler;
  onDown?: KeyboardNavigationHandler;
  onConfirm?: KeyboardNavigationHandler;
  onBack?: KeyboardNavigationHandler;
};

type Scope = {
  element: HTMLElement;
  options: MutableRefObject<KeyboardNavigationOptions>;
};

const scopes = new Set<Scope>();
let listening = false;

function getAction(key: string): KeyboardNavigationAction | null {
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
    default:
      return null;
  }
}

function isNativeEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function dispatch(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
    return;

  const action =
    getAction(event.key) ?? ([10009, 461].includes(event.keyCode) ? ('back' as const) : null);
  if (!action) return;
  if (isNativeEditingTarget(event.target) && (action !== 'back' || event.key === 'Backspace'))
    return;

  const target = event.target instanceof Node ? event.target : document.activeElement;
  const matching = [...scopes]
    .filter(
      scope =>
        scope.options.current.enabled !== false &&
        (scope.options.current.exclusive || scope.element.contains(target))
    )
    .sort((a, b) => {
      if (a.options.current.exclusive !== b.options.current.exclusive)
        return a.options.current.exclusive ? -1 : 1;
      if (a.element === b.element) return 0;
      return a.element.contains(b.element) ? 1 : -1;
    });

  for (const scope of matching) {
    const handlers: Record<KeyboardNavigationAction, keyof KeyboardNavigationOptions> = {
      left: 'onLeft',
      right: 'onRight',
      up: 'onUp',
      down: 'onDown',
      confirm: 'onConfirm',
      back: 'onBack',
    };
    const handler = scope.options.current[handlers[action]] as
      | KeyboardNavigationHandler
      | undefined;
    if (handler?.(event) === true) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
}

function register(scope: Scope): () => void {
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

export function useKeyboardNavigation(
  options: KeyboardNavigationOptions = {}
): RefCallback<HTMLElement> {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const scopeRef = useRef<Scope | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  return useCallback((element: HTMLElement | null) => {
    unregisterRef.current?.();
    unregisterRef.current = null;
    scopeRef.current = null;
    if (!element) return;

    const scope = { element, options: optionsRef };
    scopeRef.current = scope;
    unregisterRef.current = register(scope);
  }, []);
}

export { getAction as getKeyboardNavigationAction };
