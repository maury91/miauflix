import type { ReactNode } from 'react';

import { ProgressSpinner } from '../progress/Progress';
import * as styles from './action.css';

/** Props every inverted-fill action shares. */
export interface ActionStateProps {
  /** Control size; `sm` is for web only (too small for TV). */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Virtual focus, owned by the navigation layer (the pointer focuses what it moves onto). Shown as
   * the white fill; DOM focus never changes the look.
   */
  focused?: boolean;
  /**
   * Current state, not focus: the Home tab on Home, the chosen option. Shown as a translucent fill
   * on solid surfaces. Pair it with the semantic attribute the role needs (`aria-current`,
   * `aria-selected`); toggles use IconButton's `pressed`.
   */
  selected?: boolean;
  /**
   * Busy: the icon slot shows a spinner, focus and size stay, and activation is ignored until it
   * ends. Use `disabled` only for actions that are unavailable.
   */
  loading?: boolean;
}

/** The icon slot, holding the spinner while loading. Icons are decorative. */
export function ActionIcon({ icon, loading }: { icon?: ReactNode; loading: boolean }) {
  if (!loading && !icon) return null;
  return (
    <span className={styles.iconSlot} aria-hidden="true">
      {loading ? <ProgressSpinner decorative size="inherit" /> : icon}
    </span>
  );
}
