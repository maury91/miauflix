import { type ReactNode, useEffect, useState } from 'react';

import * as styles from './tooltip.css';

export interface TooltipProps {
  /** Short, non-essential description. Comes from the feature (translated there). */
  content: string;
  /** Shown while open: pass the anchor's virtual focus. Hover is focus, so there is no hover rule. */
  open: boolean;
  /** Side of the anchor. Default above. */
  placement?: 'top' | 'bottom';
  /** The bubble's alignment along the anchor; `start`/`end` for anchors near a screen edge. */
  align?: 'center' | 'start' | 'end';
  /** Id of the tooltip text, for the anchor's `aria-describedby` when it adds to the name. */
  id?: string;
  /** The anchor: one focusable control. */
  children: ReactNode;
}

/**
 * A non-interactive description next to its anchor, shown while the anchor holds focus. It never
 * joins the focus tree. Escape hides it without moving focus or activating anything; it shows
 * again the next time the anchor is focused. Never the only way to learn what a critical action
 * does, including on touch.
 */
export function Tooltip({
  content,
  open,
  placement = 'top',
  align = 'center',
  id,
  children,
}: TooltipProps) {
  const [dismissed, setDismissed] = useState(false);
  // Leaving the anchor resets the dismissal
  if (!open && dismissed) setDismissed(false);
  const shown = open && !dismissed;

  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Escape is spent on the tooltip, not on Back
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [shown]);

  return (
    <span
      className={styles.anchor}
      data-open={shown || undefined}
      data-placement={placement}
      data-align={align}
    >
      {children}
      <span className={styles.rail} aria-hidden={!shown || undefined}>
        <span id={id} role="tooltip" className={styles.bubble}>
          {content}
        </span>
        <span className={styles.pointer} />
      </span>
    </span>
  );
}
