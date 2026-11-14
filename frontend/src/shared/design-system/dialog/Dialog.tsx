import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../icon-button/IconButton';
import { SurfaceContextProvider } from '../surface';
import * as styles from './dialog.css';
import { isTopDialog, pushDialog } from './dialogStack';

import CloseIcon from '~icons/mdi/close';

export interface DialogProps {
  /** Rendered while true. */
  open: boolean;
  /** Always visible; names the dialog. */
  title: string;
  /** Short explanation under the title; describes the dialog. */
  description?: ReactNode;
  /** Body content (fields, text). Scrolls when long; the title and actions stay. */
  children?: ReactNode;
  /**
   * Buttons, primary first: focus lands on the first one. For a destructive confirmation, put the
   * least destructive choice first. `column` stacks them (narrow screens, long labels on TV).
   */
  actions: ReactNode;
  actionsLayout?: 'row' | 'column';
  /**
   * Back (Escape, remote Back) and a press on the scrim call this when the dialog is dismissible.
   * Without it, the dialog closes only through its actions (a required choice).
   */
  onDismiss?: () => void;
  /**
   * Adds the close IconButton in the corner, with this accessible name (e.g. "Close"). Only for
   * dismissible dialogs (with `onDismiss`).
   */
  closeLabel?: string;
  /** Virtual focus on the close button, from the navigation layer. */
  closeFocused?: boolean;
  /** Called when the pointer moves onto the close button. */
  onCloseFocus?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const isEditing = () => {
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && active.type !== 'checkbox' && active.type !== 'radio')
  );
};

/**
 * A labelled modal overlay with a scrollable body and actions. Nothing behind it can be reached:
 * the navigation layer restricts movement to the topmost scope, and the scrim takes the pointer.
 * Back dismisses only the topmost dialog, and only after a field in edit mode has left it. DOM
 * focus moves to the panel while open, for assistive technology, and returns when it closes;
 * virtual focus (its initial target and the restoration to the opener) is the navigation layer's.
 */
export function Dialog({
  open,
  title,
  description,
  children,
  actions,
  actionsLayout = 'row',
  onDismiss,
  closeLabel,
  closeFocused = false,
  onCloseFocus,
  size = 'md',
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    const pop = pushDialog(id);
    const previous = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(id) || getKeyboardAction(event) !== 'back') return;
      // Backspace edits text; any Back while editing leaves the edit layer first
      if (event.key === 'Backspace' || isEditing()) return;
      event.preventDefault();
      event.stopPropagation();
      onDismissRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      pop();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onDismissRef.current?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={styles.panel}
        data-size={size}
      >
        <SurfaceContextProvider value="solid">
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {closeLabel && onDismiss && (
              <span className={styles.close}>
                <IconButton
                  label={closeLabel}
                  icon={<CloseIcon />}
                  focused={closeFocused}
                  onMouseMove={onCloseFocus}
                  onClick={() => onDismissRef.current?.()}
                />
              </span>
            )}
          </div>
          {(description || children) && (
            <div className={styles.body}>
              {description && (
                <p id={descriptionId} className={styles.description}>
                  {description}
                </p>
              )}
              {children}
            </div>
          )}
          <div className={styles.actions} data-layout={actionsLayout}>
            {actions}
          </div>
        </SurfaceContextProvider>
      </div>
    </div>,
    document.body
  );
}
