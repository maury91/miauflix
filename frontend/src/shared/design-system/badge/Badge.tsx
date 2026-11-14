import type { ReactNode } from 'react';

import { visuallyHidden } from '../a11y.css';
import type { MessageTone } from '../message/Message';
import * as styles from './badge.css';

export type BadgeProps = {
  /** Short visible text from the feature: "4K", "New", "99+". */
  children: string;
  /** What assistive technology reads instead, when the visible text is an abbreviation or a count. */
  accessibleLabel?: string;
} & (
  | {
      /** A short label (quality, availability), uppercase. */
      kind?: 'label';
      /** Neutral by default; a feedback tone colours the border and text. */
      tone?: 'neutral' | MessageTone;
      /** Decorative icon before the text. */
      icon?: ReactNode;
    }
  | {
      /** A pill count ("3", "99+"), light on dark surfaces and dark on a focused action. */
      kind: 'count';
      tone?: undefined;
      icon?: undefined;
    }
);

/** A passive, compact label. Never a focus target and never an action; never brand red. */
export function Badge({
  children,
  accessibleLabel,
  kind = 'label',
  tone = 'neutral',
  icon,
}: BadgeProps) {
  return (
    <span className={styles.badge} data-kind={kind} data-tone={kind === 'label' ? tone : undefined}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span aria-hidden={accessibleLabel ? true : undefined}>{children}</span>
      {accessibleLabel && <span className={visuallyHidden}>{accessibleLabel}</span>}
    </span>
  );
}
