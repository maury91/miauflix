import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';

import { visuallyHidden } from '../a11y.css';
import { containTab, isEditing } from '../overlayFocus';
import { SurfaceContextProvider } from '../surface';
import * as styles from './popover.css';
import { isTopPopover, pushPopover } from './popoverStack';

/** Props for the element that opens the popover; the feature's own `onClick` toggles `open`. */
export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  'aria-haspopup': 'dialog';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
}

export interface PopoverProps {
  /** Shown while true; the feature opens it from the trigger's `onClick` or anywhere else. */
  open: boolean;
  /** Back, a press outside or (non-modal) Tab leaving it ask to close; the feature sets `open`. */
  onDismiss: () => void;
  /**
   * The named policy (style guide, section 9). `modal` contains: Tab cycles inside, a press
   * outside closes it without reaching what is underneath, and the navigation layer keeps virtual
   * focus inside. `nonModal` lets go: a press outside closes it and still acts, and Tab leaving it
   * closes it.
   */
  modality: 'modal' | 'nonModal';
  /** Names the popover, shown as its heading unless `hideTitle`. Comes from the feature (i18n). */
  title: string;
  hideTitle?: boolean;
  /** Renders the trigger with the props that describe the popover. */
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode;
  placement?: 'bottom' | 'top';
  /** Which trigger edge it lines up with; `end` for triggers near the end of the screen. */
  align?: 'start' | 'end';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * An interactive panel next to its trigger: a few settings, a short form, a choice of tracks. Its
 * content is a child group the navigation layer enters; the popover itself handles only closing.
 * Back closes it (the innermost popover first, after a tooltip's Escape and a field's edit mode;
 * before a Dialog around it). DOM focus moves to the panel for assistive technology and returns to
 * the trigger. Placed without measuring: choose `placement` and `align` from where the trigger is.
 */
export function Popover({
  open,
  onDismiss,
  modality,
  title,
  hideTitle = false,
  trigger,
  children,
  placement = 'bottom',
  align = 'start',
  size = 'md',
}: PopoverProps) {
  const [id] = useState(() => Symbol('popover'));
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ onDismiss, modality });
  latest.current = { onDismiss, modality };

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const triggerElement = triggerRef.current;
    const pop = pushPopover(id);
    panel?.focus({ preventScroll: true });
    const inside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(rootRef.current?.contains(target));

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopPopover(id) || !panel) return;
      if (event.key === 'Tab') {
        if (latest.current.modality === 'modal') containTab(event, panel);
        return;
      }
      if (event.defaultPrevented || getKeyboardAction(event) !== 'back') return;
      // Backspace edits text; any Back while editing leaves the edit layer first
      if (event.key === 'Backspace' || isEditing()) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onDismiss();
    };
    // Outside presses: a modal popover swallows the press (and its click), a non-modal one lets it act
    let swallowClick = false;
    const onPointerDown = (event: MouseEvent) => {
      if (!isTopPopover(id) || inside(event.target)) return;
      if (latest.current.modality === 'modal') {
        event.preventDefault();
        event.stopPropagation();
        swallowClick = true;
      }
      latest.current.onDismiss();
    };
    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // DOM focus leaving a non-modal popover (Tab, assistive technology) closes it
    const onFocusOut = (event: FocusEvent) => {
      if (latest.current.modality === 'modal') return;
      const next = event.relatedTarget;
      if (next instanceof Node && !inside(next)) latest.current.onDismiss();
    };

    // Document capture: after a tooltip's Escape (window capture), before a Dialog's Back (bubble)
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    panel?.addEventListener('focusout', onFocusOut);
    return () => {
      pop();
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('click', onClick, true);
      panel?.removeEventListener('focusout', onFocusOut);
      // DOM focus returns to the trigger when it was inside (or left on the body)
      const focused = document.activeElement;
      if (!focused || focused === document.body || panel?.contains(focused)) {
        triggerElement?.focus({ preventScroll: true });
      }
    };
  }, [open, id]);

  return (
    <span ref={rootRef} className={styles.root}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': open ? panelId : undefined,
      })}
      {open && (
        <SurfaceContextProvider value="solid">
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal={modality === 'modal' || undefined}
            aria-labelledby={titleId}
            tabIndex={-1}
            className={styles.panel}
            data-placement={placement}
            data-align={align}
            data-size={size}
          >
            <h2 id={titleId} className={hideTitle ? visuallyHidden : styles.title}>
              {title}
            </h2>
            {children}
          </div>
        </SurfaceContextProvider>
      )}
    </span>
  );
}
