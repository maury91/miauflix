import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { useEffect, useRef, useState } from 'react';

const isEditable = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement =>
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement && element.type !== 'checkbox' && element.type !== 'radio');

/**
 * Story-only stand-in for the navigation layer: one virtual focus over a grid of IDs, given row by
 * row. Left/Right move within a row, Up/Down to the nearest item of the next row. The pointer
 * focuses what it moves onto. Confirm activates the focused element: a button through a click (the
 * same path as the pointer), a field by entering edit mode (DOM focus on its input), a choice
 * through a click on its native control. While editing,
 * the input owns its keys; Escape (or Enter in a single-line input) ends editing.
 *
 * The real layer (docs/plans/style-guide.md, section 10) adds scopes, groups and the pointer lock.
 */
export function useStoryVirtualFocus(grid: readonly (readonly string[])[], initialId?: string) {
  const [focusedId, setFocusedId] = useState(initialId ?? grid[0]?.[0] ?? '');
  const focusedRef = useRef(focusedId);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const focus = (id: string) => {
    focusedRef.current = id;
    setFocusedId(id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current ?? document.body;
      const active = document.activeElement;
      if (isEditable(active) && container.contains(active)) {
        const endsEditing =
          event.key === 'Escape' ||
          (event.key === 'Enter' && active instanceof HTMLInputElement && !event.defaultPrevented);
        if (endsEditing && !event.isComposing) {
          event.preventDefault();
          active.blur();
        }
        return;
      }
      const keyAction = getKeyboardAction(event);
      const rows = gridRef.current;
      const row = rows.findIndex(items => items.includes(focusedRef.current));
      const column = row === -1 ? 0 : rows[row].indexOf(focusedRef.current);
      if (keyAction === 'left' || keyAction === 'right') {
        event.preventDefault();
        const items = rows[row] ?? [];
        const next = items[column + (keyAction === 'left' ? -1 : 1)];
        if (next !== undefined) focus(next);
      } else if (keyAction === 'up' || keyAction === 'down') {
        event.preventDefault();
        const items = rows[row + (keyAction === 'up' ? -1 : 1)];
        if (items) focus(items[Math.min(column, items.length - 1)]);
      } else if (keyAction === 'confirm') {
        // Also keeps a DOM-focused button from activating a second time
        event.preventDefault();
        const target = container.querySelector('[data-focused]');
        if (target instanceof HTMLButtonElement) {
          target.click();
          return;
        }
        // A field enters edit mode; a choice toggles through its native control
        const editable = target?.querySelector(
          'input:not([type="checkbox"]):not([type="radio"]), textarea'
        );
        if (editable instanceof HTMLElement) {
          editable.focus();
          return;
        }
        // A native select opens the platform picker where the browser allows it
        const picker = target?.querySelector('select');
        if (picker) {
          try {
            picker.showPicker();
          } catch {
            // Older engines, or no user activation
            picker.focus();
          }
          return;
        }
        const toggle = target?.querySelector('input, button');
        if (toggle instanceof HTMLElement) toggle.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    /**
     * Put on the element wrapping the focusable items; Confirm acts on its `[data-focused]`. Without
     * it, the whole document.
     */
    containerRef,
    focusedId,
    focus,
    isFocused: (id: string) => focusedId === id,
  };
}

/** A single row of `count` items, addressed by index, for action stories. */
export function useStoryVirtualRow(count: number, initialIndex = 0) {
  const ids = Array.from({ length: count }, (_, index) => String(index));
  const { focusedId, focus } = useStoryVirtualFocus([ids], String(initialIndex));
  const itemProps = (index: number) => ({
    focused: focusedId === String(index),
    onMouseMove: () => focus(String(index)),
  });

  return { focusedIndex: Number(focusedId), itemProps };
}
