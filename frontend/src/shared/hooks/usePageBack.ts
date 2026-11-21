import { type RefCallback, useCallback, useRef } from 'react';

import { useKeyboardNavigation } from './useKeyboardNavigation';

const isEditing = (element: Element | null) =>
  (element instanceof HTMLInputElement && element.type !== 'range') ||
  element instanceof HTMLTextAreaElement;

export interface PageBackProps {
  ref: RefCallback<HTMLElement>;
  /** Programmatic focus only (see below), never a Tab stop. */
  tabIndex: -1;
  onBlur: () => void;
}

/**
 * Back on a page under the navigation layer: it ends editing a field first (closing a TV's
 * keyboard), then calls `onBack`. Spread the result on the page's root element.
 *
 * Virtual focus on a text field moves no DOM focus, so DOM focus would otherwise rest on the
 * document body and the page's keys (an element scope, which wins over the page-wide navigation
 * keys) would never see Back. The page keeps DOM focus on itself whenever nothing inside it has
 * it, without drawing a ring.
 */
export function usePageBack(onBack: (() => void) | undefined): PageBackProps {
  const keysRef = useKeyboardNavigation({
    onBack: event => {
      const active = document.activeElement;
      if (isEditing(active)) {
        if (event.key === 'Backspace') return false;
        (active as HTMLElement).blur();
        return true;
      }
      if (!onBack) return false;
      onBack();
      return true;
    },
  });
  const pageRef = useRef<HTMLElement | null>(null);
  const keepFocusInPage = useCallback(() => {
    queueMicrotask(() => {
      const active = document.activeElement;
      if (!active || active === document.body) pageRef.current?.focus({ preventScroll: true });
    });
  }, []);
  const ref = useCallback(
    (element: HTMLElement | null) => {
      pageRef.current = element;
      keysRef(element);
      if (element) keepFocusInPage();
    },
    [keysRef, keepFocusInPage]
  );
  return { ref, tabIndex: -1, onBlur: keepFocusInPage };
}
