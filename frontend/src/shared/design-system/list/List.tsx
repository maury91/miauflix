import type { ReactNode } from 'react';

import * as styles from './list.css';
import { InListProvider } from './listContext';

export interface ListProps {
  /** Accessible name when the list has no visible heading pointing at it. */
  label?: string;
  /** Id of the visible heading naming the list. */
  labelledBy?: string;
  /** A hairline between rows instead of a gap. */
  divided?: boolean;
  /** ListItems and SettingRows. */
  children: ReactNode;
}

/**
 * A vertical list of rows. Rows inside it are list items; movement between them (Up/Down, edges
 * leave the list) belongs to the navigation layer.
 */
export function List({ label, labelledBy, divided = false, children }: ListProps) {
  return (
    <div
      role="list"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={styles.list}
      data-divided={divided || undefined}
    >
      <InListProvider value>{children}</InListProvider>
    </div>
  );
}
