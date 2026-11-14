import type { ReactNode } from 'react';

import * as styles from './field.css';

import AlertIcon from '~icons/mdi/alert-circle-outline';

/** A validation message: danger color plus an icon, never color alone. */
export function ErrorMessage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <span className={styles.errorIcon} aria-hidden="true">
        <AlertIcon />
      </span>
      <span>{children}</span>
    </p>
  );
}
