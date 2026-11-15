import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';

import { SurfaceContextProvider } from '../surface';
import * as styles from './menu.css';
import { isSeparator, type MenuAction, type MenuEntry, stepAction } from './menuItems';

/** Props for the element that opens the menu, usually an IconButton or a Button. */
export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
}

export interface MenuProps {
  /** The menu's accessible name, from the feature (i18n): "Profile actions". */
  label: string;
  items: readonly MenuEntry[];
  /** An action was chosen (Confirm or a press). The menu closes first; links also navigate. */
  onAction: (id: string) => void;
  /** Renders the trigger with the props that open and describe the menu. */
  trigger: (props: MenuTriggerProps) => ReactNode;
  /** Opened or closed: while open the menu owns the arrows, Confirm and Back. */
  onOpenChange?: (open: boolean) => void;
  placement?: 'bottom' | 'top';
  /** Which trigger edge the menu lines up with; `end` for triggers near the end of the screen. */
  align?: 'start' | 'end';
}

/**
 * An action menu next to its trigger. While open it contains focus: Up/Down move the active item
 * (skipping disabled ones, clamped at the ends), Left/Right stay inside, Confirm runs the item and
 * closes, Back closes it, and a press outside dismisses it. DOM focus goes to the menu for assistive
 * technology and returns to the trigger. Submenus are not supported until a feature needs one.
 */
export function Menu({
  label,
  items,
  onAction,
  trigger,
  onOpenChange,
  placement = 'bottom',
  align = 'start',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const itemId = (id: string) => `${menuId}-${id}`;
  const latest = useRef({ items, active, onAction, onOpenChange });
  latest.current = { items, active, onAction, onOpenChange };

  const setOpenState = (next: boolean) => {
    setOpen(next);
    latest.current.onOpenChange?.(next);
  };
  const openMenu = () => {
    setActive(stepAction(items, null, 1));
    setOpenState(true);
  };
  const close = () => setOpenState(false);

  const choose = (id: string) => {
    close();
    latest.current.onAction(id);
  };
  const run = (action: MenuAction) => {
    if (action.disabled) return;
    // A link goes through its own click, so the browser navigates; its handler closes and reports
    if (action.href) document.getElementById(itemId(action.id))?.click();
    else choose(action.id);
  };
  const runRef = useRef(run);
  runRef.current = run;
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const menu = document.getElementById(menuId);
    const triggerElement = triggerRef.current;
    menu?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      const keyAction = getKeyboardAction(event);
      if (!keyAction) return;
      if (!['up', 'down', 'left', 'right', 'confirm', 'back'].includes(keyAction)) return;
      event.preventDefault();
      event.stopPropagation();
      const { items: entries, active: current } = latest.current;
      if (keyAction === 'up' || keyAction === 'down') {
        setActive(stepAction(entries, current, keyAction === 'up' ? -1 : 1));
      } else if (keyAction === 'confirm') {
        const action = entries.find(
          (entry): entry is MenuAction => !isSeparator(entry) && entry.id === current
        );
        if (action) runRef.current(action);
      } else if (keyAction === 'back') {
        closeRef.current();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
      // DOM focus returns to the trigger (the menu is gone, so focus was left on the body)
      const focused = document.activeElement;
      if (!focused || focused === document.body || menu?.contains(focused)) {
        triggerElement?.focus({ preventScroll: true });
      }
    };
  }, [open, menuId]);

  // When any item has an icon, every label starts at the same edge
  const withIcons = items.some(entry => !isSeparator(entry) && entry.icon);
  const renderAction = (action: MenuAction) => {
    const content = (
      <>
        {withIcons && (
          <span className={styles.icon} aria-hidden="true">
            {action.icon}
          </span>
        )}
        <span className={styles.label}>{action.label}</span>
      </>
    );
    const common = {
      id: itemId(action.id),
      role: 'menuitem',
      tabIndex: -1,
      className: styles.item,
      'aria-disabled': action.disabled || undefined,
      'data-active': (action.id === active && !action.disabled) || undefined,
      onMouseMove: () => {
        if (!action.disabled && action.id !== active) setActive(action.id);
      },
    };
    if (action.href) {
      return (
        <a
          key={action.id}
          {...common}
          href={action.disabled ? undefined : action.href}
          onClick={event => {
            if (action.disabled) event.preventDefault();
            else choose(action.id);
          }}
        >
          {content}
        </a>
      );
    }
    return (
      <div key={action.id} {...common} onClick={() => run(action)}>
        {content}
      </div>
    );
  };

  return (
    <span ref={rootRef} className={styles.root}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => (open ? close() : openMenu()),
      })}
      {open && (
        <SurfaceContextProvider value="solid">
          <div
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={active ? itemId(active) : undefined}
            className={styles.popup}
            data-placement={placement}
            data-align={align}
          >
            {items.map(entry =>
              isSeparator(entry) ? (
                <div key={entry.id} role="separator" className={styles.separator} />
              ) : (
                renderAction(entry)
              )
            )}
          </div>
        </SurfaceContextProvider>
      )}
    </span>
  );
}
