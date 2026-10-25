import type { RefCallback } from 'react';
import { useCallback, useRef } from 'react';

import {
  getKeyAction,
  type KeyboardHandler,
  type KeyboardOptions,
  type KeyboardScope,
  registerKeyboardScope,
} from './useKeyboard';

export type KeyboardNavigationAction = 'left' | 'right' | 'up' | 'down' | 'confirm' | 'back';

export type KeyboardNavigationHandler = KeyboardHandler;

export type KeyboardNavigationOptions = KeyboardOptions;

/** Map a key name to a D-pad navigation action, or null when it is not one. */
export function getKeyboardNavigationAction(key: string): KeyboardNavigationAction | null {
  const action = getKeyAction(key);
  return action === 'search' ? null : action;
}

/**
 * Return a callback ref that registers keyboard navigation for its attached element.
 * Handlers return true to consume an action or false to let another matching scope handle it.
 * Exclusive scopes receive keys even outside their element; enabled=false suspends handling.
 * Detaching the ref unregisters the scope, and updated options take effect without reattachment.
 * Keys and TV remote codes are resolved by `useKeyboard`, which also handles page-wide keys.
 */
export function useKeyboardNavigation(
  options: KeyboardNavigationOptions = {}
): RefCallback<HTMLElement> {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const unregisterRef = useRef<(() => void) | null>(null);

  return useCallback((element: HTMLElement | null) => {
    unregisterRef.current?.();
    unregisterRef.current = null;
    if (!element) return;

    const scope: KeyboardScope = { element, options: optionsRef };
    unregisterRef.current = registerKeyboardScope(scope);
  }, []);
}
