import type { ReactNode } from 'react';

import * as styles from './actionGroup.css';

export interface ActionGroupProps {
  /**
   * The actions, primary first: the visual, DOM and focus order are the same, and the navigation
   * layer lands on the first one. Buttons or IconButtons, never wrapped.
   */
  children: ReactNode;
  /**
   * `row` (default) wraps onto more lines when there is no room; `column` stacks them full width
   * (long labels, TV dialogs); `auto` stacks them on compact windows only.
   */
  layout?: 'row' | 'column' | 'auto';
  /** Where a row sits: `start` (default), `center` (an empty state) or `end` (a form's footer). */
  align?: 'start' | 'center' | 'end';
  /** Rows wrap by default; `false` keeps one line (navigation then moves by axis only). */
  wrap?: boolean;
  /** A hairline above, separating the actions from the content they act on. Opt-in. */
  divider?: boolean;
  /** Names the group for assistive technology when several groups share a screen. */
  label?: string;
}

/**
 * A set of actions with their spacing, alignment and wrapping owned in one place, primary first.
 * Passive layout: the navigation layer moves through it by its axis when it is one line and by its
 * rendered rows when it wraps. Each action keeps its own look; the group never styles them.
 */
export function ActionGroup({
  children,
  layout = 'row',
  align = 'start',
  wrap = true,
  divider = false,
  label,
}: ActionGroupProps) {
  return (
    <div
      className={styles.group}
      role={label ? 'group' : undefined}
      aria-label={label}
      data-layout={layout}
      data-align={align}
      data-wrap={wrap || undefined}
      data-divider={divider || undefined}
    >
      <div className={styles.list}>{children}</div>
    </div>
  );
}
