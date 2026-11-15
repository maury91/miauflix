import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '../icon-button/IconButton';
import { SurfaceContextProvider } from '../surface';
import * as styles from './dialog.css';
import { isTopDialog, pushDialog, topDialogRoot } from './dialogStack';

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

const tabbable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The enclosing dialog, so a nested dialog registers above it (see dialogStack). */
const ParentDialogContext = createContext<symbol | undefined>(undefined);

/** Tab and Shift+Tab cycle inside the dialog (desktop keyboards; TV remotes have no Tab). */
function containTab(event: KeyboardEvent, panel: HTMLElement) {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(tabbable));
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

const isEditing = () => {
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && active.type !== 'checkbox' && active.type !== 'radio')
  );
};

/**
 * A labelled modal overlay with a scrollable body and actions. Nothing behind it can be reached:
 * the navigation layer restricts movement to the topmost scope, everything outside the topmost
 * dialog is `inert`, Tab cycles inside it, and the scroll lock is shared by all open dialogs.
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
  const [id] = useState(() => Symbol('dialog'));
  const parent = useContext(ParentDialogContext);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement;
    const pop = pushDialog(id, panel?.parentElement ?? null, parent);
    // A dialog under a nested one open from the start leaves focus in the nested one
    if (isTopDialog(id)) panel?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(id)) return;
      if (event.key === 'Tab' && panel) {
        containTab(event, panel);
        return;
      }
      // A tooltip spends Escape first (see Tooltip)
      if (event.defaultPrevented || getKeyboardAction(event) !== 'back') return;
      // Backspace edits text; any Back while editing leaves the edit layer first
      if (event.key === 'Backspace' || isEditing()) return;
      event.preventDefault();
      event.stopPropagation();
      onDismissRef.current?.();
    };
    // Bubble phase on the document: a tooltip's capture listener on the window runs first
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = isTopDialog(id);
      const opener = pop();
      // An underlying dialog closing leaves focus where it is, in the topmost one
      if (!wasTop) return;
      const nextRoot = topDialogRoot();
      // Back to what opened this dialog if it is still there and reachable; otherwise the next
      // dialog's panel, or the element that opened the first dialog
      const fallback = nextRoot ? nextRoot.querySelector('[role="dialog"]') : opener;
      // A candidate that cannot take focus (disabled, hidden) gives way to the next one
      for (const element of [previous, fallback]) {
        if (!(element instanceof HTMLElement) || !element.isConnected) continue;
        if (nextRoot && !nextRoot.contains(element)) continue;
        element.focus({ preventScroll: true });
        if (document.activeElement === element) break;
      }
    };
  }, [open, id, parent]);

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
        <ParentDialogContext.Provider value={id}>
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
        </ParentDialogContext.Provider>
      </div>
    </div>,
    document.body
  );
}
