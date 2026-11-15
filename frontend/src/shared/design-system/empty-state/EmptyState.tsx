import type { ReactNode } from 'react';

import { ActionGroup } from '../action-group/ActionGroup';
import * as styles from './emptyState.css';

export interface EmptyStateProps {
  /** Decorative icon or artwork. */
  visual?: ReactNode;
  /** What is absent, e.g. "No results for “dune”". From the feature (i18n). */
  heading: string;
  /** Heading level in the page outline. */
  headingLevel?: 2 | 3;
  /** What to do next, briefly. */
  children?: ReactNode;
  /** Buttons, primary first: focus lands on the first one. */
  actions?: ReactNode;
  /** A Message when absence comes from a problem (a failed load), not from an empty collection. */
  message?: ReactNode;
}

/**
 * Absent content: an empty list, no search results, nothing downloaded yet. It explains and offers
 * the next step; it is not an error primitive (a failure is a Message, here or on its own). Not a
 * focus target: its actions are.
 */
export function EmptyState({
  visual,
  heading,
  headingLevel = 2,
  children,
  actions,
  message,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={styles.emptyState} aria-label={heading}>
      {visual && (
        <div className={styles.visual} aria-hidden="true">
          {visual}
        </div>
      )}
      <Heading className={styles.heading}>{heading}</Heading>
      {children && <p className={styles.body}>{children}</p>}
      {message && <div className={styles.message}>{message}</div>}
      {actions && (
        <div className={styles.actions}>
          <ActionGroup align="center">{actions}</ActionGroup>
        </div>
      )}
    </section>
  );
}
