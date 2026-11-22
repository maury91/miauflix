import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { FocusScope } from '@shared/navigation/NavigationProvider';
import {
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { visuallyHidden } from '../a11y.css';
import { containTab, isEditing } from '../overlayFocus';
import { SurfaceContextProvider } from '../surface';
import * as styles from './popover.css';
import { isInNestedPopover, isTopPopover, pushPopover } from './popoverStack';

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
  /**
   * `sheet` docks the panel to the end edge of `container`, its full height (a side panel over a
   * player); `bottom` and `top` place it next to the trigger.
   */
  placement?: 'bottom' | 'top' | 'sheet';
  /**
   * Where a `sheet` is drawn: a positioned element it covers the end of (the player, so the sheet
   * shows in full screen too). Without one, the sheet is drawn next to the trigger.
   */
  container?: HTMLElement | null;
  /** The navId focused on opening (a group enters at its chosen item); else the first item. */
  initialNavId?: string;
  /** Which trigger edge it lines up with; `end` for triggers near the end of the screen. */
  align?: 'start' | 'end';
  size?: 'sm' | 'md' | 'lg';
}

/** The enclosing popover, so a nested one stays above it (see popoverStack). */
const ParentPopoverContext = createContext<symbol | undefined>(undefined);

/**
 * A modal popover's outside press is swallowed with its click. The click comes after the release,
 * once the popover may already be gone, so this outlives the popover: it ends with that click, or
 * just after the release when no click follows (the press moved off its target).
 */
function swallowNextClick() {
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const onRelease = () => window.setTimeout(stop);
  const stop = () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mouseup', onRelease, true);
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseup', onRelease, true);
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
  container,
  initialNavId,
}: PopoverProps) {
  const [id] = useState(() => Symbol('popover'));
  const parent = useContext(ParentPopoverContext);
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // A sheet without a container to cover sits above its trigger instead
  const sheet = placement === 'sheet' && Boolean(container);
  /** Where the panel is drawn: the container for a sheet, else inline. */
  const portal = sheet ? container : null;
  const latest = useRef({ onDismiss, modality });
  latest.current = { onDismiss, modality };

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const triggerElement = triggerRef.current;
    const pop = pushPopover(id, parent, panel);
    // The navigation layer may already have mirrored focus onto the first item inside
    if (!panel?.contains(document.activeElement)) panel?.focus({ preventScroll: true });
    // A sheet is drawn elsewhere: its panel counts as inside too, as do popovers nested in this one
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      Boolean(
        rootRef.current?.contains(target) ||
          panelRef.current?.contains(target) ||
          isInNestedPopover(id, target)
      );

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
    const onPointerDown = (event: MouseEvent) => {
      if (!isTopPopover(id) || inside(event.target)) return;
      if (latest.current.modality === 'modal') {
        event.preventDefault();
        event.stopPropagation();
        swallowNextClick();
      }
      latest.current.onDismiss();
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
    panel?.addEventListener('focusout', onFocusOut);
    return () => {
      pop();
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
      panel?.removeEventListener('focusout', onFocusOut);
      // DOM focus returns to the trigger when it was inside (or left on the body)
      const focused = document.activeElement;
      if (!focused || focused === document.body || panel?.contains(focused)) {
        triggerElement?.focus({ preventScroll: true });
      }
    };
    // The enclosing popover is fixed for this one's lifetime. A new portal destination draws a
    // new panel: its listeners move to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, portal]);
  const panel = (
    <SurfaceContextProvider value="solid">
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal={modality === 'modal' || undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.panel}
        data-placement={sheet ? 'sheet' : placement === 'sheet' ? 'top' : placement}
        data-align={align}
        data-size={size}
      >
        <h2 id={titleId} className={hideTitle ? visuallyHidden : styles.title}>
          {title}
        </h2>
        {/* Modal contains virtual focus (Tab included) and restores the opener; non-modal only
            takes it */}
        <FocusScope contain={modality === 'modal'} autoFocus initialId={initialNavId}>
          <ParentPopoverContext.Provider value={id}>{children}</ParentPopoverContext.Provider>
        </FocusScope>
      </div>
    </SurfaceContextProvider>
  );

  return (
    <span ref={rootRef} className={styles.root}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': open ? panelId : undefined,
      })}
      {open && (portal ? createPortal(panel, portal) : panel)}
    </span>
  );
}
