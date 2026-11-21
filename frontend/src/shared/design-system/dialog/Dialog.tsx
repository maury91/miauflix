import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { useOptionalNavigation } from '@shared/navigation/hooks';
import { FocusScope } from '@shared/navigation/NavigationProvider';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { ActionGroup } from '../action-group/ActionGroup';
import { IconButton } from '../icon-button/IconButton';
import { containTab, isEditing } from '../overlayFocus';
import { SurfaceContextProvider } from '../surface';
import * as styles from './dialog.css';
import { isTopDialog, pushDialog, topDialogRoot } from './dialogStack';

import CloseIcon from '~icons/mdi/close';

/**
 * A body taller than the dialog scrolls: then it joins Tab order, so a keyboard can scroll it
 * (a remote moves through the actions instead). Measured as it mounts (a dialog mounted closed
 * renders its body only once it opens) and as it resizes.
 */
function useScrollable<E extends HTMLElement>() {
  const [element, ref] = useState<E | null>(null);
  const [scrollable, setScrollable] = useState(false);
  useLayoutEffect(() => {
    if (!element) {
      setScrollable(false);
      return undefined;
    }
    const measure = () => setScrollable(element.scrollHeight > element.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [element]);
  return { ref, scrollable };
}

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
   * The navId focused on opening (a form's first field). Defaults to the first action. The
   * navigation layer restores the opener on closing.
   */
  initialNavId?: string;
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

/** The enclosing dialog, so a nested dialog registers above it (see dialogStack). */
const ParentDialogContext = createContext<symbol | undefined>(undefined);

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
  initialNavId,
  onDismiss,
  closeLabel,
  closeFocused = false,
  onCloseFocus,
  size = 'md',
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  // Navigation IDs: the scope starts on the actions (the primary first)
  const navBase = useId();
  const actionsNavId = `${navBase}-actions`;
  const panelRef = useRef<HTMLDivElement>(null);
  const body = useScrollable<HTMLDivElement>();
  const [id] = useState(() => Symbol('dialog'));
  const parent = useContext(ParentDialogContext);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const navigation = useOptionalNavigation();
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement;
    const pop = pushDialog(id, panel?.parentElement ?? null, parent);
    // A dialog under a nested one open from the start leaves focus in the nested one, and content
    // that already took focus inside the panel (a popover open from the start) keeps it
    const focusedInside = panel?.contains(document.activeElement) ?? false;
    if (isTopDialog(id) && !focusedInside) panel?.focus({ preventScroll: true });

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
      // Under a navigation layer, focus belongs to what it restored (the opener, or what it picked
      // in its place). It restored that while the page was still `inert`, which the browser
      // ignores: now that the page is live, give the element DOM focus. A microtask, so the
      // layer's own restoration (also a microtask, queued as the dialog's scope closed) runs first.
      const restore = navigationRef.current?.restoreDomFocus;
      if (restore) queueMicrotask(restore);
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
          <FocusScope id={`${navBase}-scope`} contain initialId={initialNavId ?? actionsNavId}>
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
                      navId={`${navBase}-close`}
                      onMouseMove={onCloseFocus}
                      onClick={() => onDismissRef.current?.()}
                    />
                  </span>
                )}
              </div>
              {(description || children) && (
                <div
                  ref={body.ref}
                  className={styles.body}
                  tabIndex={body.scrollable ? 0 : undefined}
                >
                  {description && (
                    <p id={descriptionId} className={styles.description}>
                      {description}
                    </p>
                  )}
                  {children}
                </div>
              )}
              <div className={styles.actions}>
                <ActionGroup layout={actionsLayout} navId={actionsNavId}>
                  {actions}
                </ActionGroup>
              </div>
            </SurfaceContextProvider>
          </FocusScope>
        </ParentDialogContext.Provider>
      </div>
    </div>,
    document.body
  );
}
