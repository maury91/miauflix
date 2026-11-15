import type { ReactNode } from 'react';

import * as styles from './message.css';

import DangerIcon from '~icons/mdi/alert-circle-outline';
import WarningIcon from '~icons/mdi/alert-outline';
import SuccessIcon from '~icons/mdi/check-circle-outline';
import InfoIcon from '~icons/mdi/information-outline';

export type MessageTone = 'info' | 'success' | 'warning' | 'danger';

const icons = { info: InfoIcon, success: SuccessIcon, warning: WarningIcon, danger: DangerIcon };

export interface MessageProps {
  tone?: MessageTone;
  /** `inline` sits in a form or panel without a box; `banner` is a raised box with an accent edge. */
  variant?: 'inline' | 'banner';
  /** Short summary. Optional: a one-line message is just its body. */
  title?: ReactNode;
  /** What happened and how to recover. All text comes from the feature (i18n). */
  children: ReactNode;
  /** One or two Buttons (retry, details). They are ordinary focus targets; the message is not. */
  actions?: ReactNode;
  /**
   * Announce it when it appears: `polite` (status) for results, `assertive` (alert) only for
   * failures that block the task. Leave unset for messages present from the start, so a region
   * announces once instead of repeating.
   */
  live?: 'polite' | 'assertive';
  /**
   * The tone in words for assistive technology ("Error", "Warning"), when the text alone doesn't
   * say it. Sighted users get the icon.
   */
  toneLabel?: string;
}

/**
 * Feedback: info, success, warning or danger, always with its icon, never by color alone. Replaces
 * Alert, ErrorNotice, ErrorMessage and service-test results. Not a focus target.
 */
export function Message({
  tone = 'info',
  variant = 'inline',
  title,
  children,
  actions,
  live,
  toneLabel,
}: MessageProps) {
  const Icon = icons[tone];
  const role = live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
  return (
    <div role={role} className={styles.message} data-tone={tone} data-variant={variant}>
      <span
        className={styles.icon}
        role={toneLabel ? 'img' : undefined}
        aria-label={toneLabel}
        aria-hidden={toneLabel ? undefined : true}
      >
        <Icon />
      </span>
      <div className={styles.content}>
        <div className={styles.text}>
          {title && <strong className={styles.title}>{title}</strong>}
          <span className={styles.body}>{children}</span>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
