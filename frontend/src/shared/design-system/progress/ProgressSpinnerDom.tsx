import { visuallyHidden } from '../a11y.css';
import type { ProgressSpinnerProps } from './Progress';
import * as styles from './progress.css';

import SpinnerIcon from '~icons/line-md/loading-twotone-loop';

/** ProgressSpinner as DOM: the animated icon, and the label shown or visually hidden. */
export function ProgressSpinnerDom({
  label,
  size = 'md',
  showLabel = false,
}: ProgressSpinnerProps) {
  const icon = (
    <span className={styles.spinner} data-size={size} aria-hidden="true">
      <SpinnerIcon />
    </span>
  );
  if (label === undefined) return icon;
  return (
    <span role="status" className={styles.spinnerWithLabel}>
      {icon}
      <span className={showLabel ? styles.spinnerLabel : visuallyHidden}>{label}</span>
    </span>
  );
}
