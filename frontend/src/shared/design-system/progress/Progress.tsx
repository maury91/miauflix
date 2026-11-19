import { useRenderMode } from '../gl';
import * as styles from './progress.css';
import type { SpinnerSize } from './progress.metrics';
import { ProgressSpinnerDom } from './ProgressSpinnerDom';
import { ProgressSpinnerGl } from './ProgressSpinnerGl';

export type ProgressSemantics =
  | {
      /**
       * What is in progress, e.g. "Loading sources". Gives it status semantics (`status` for the
       * spinner, `progressbar` for the bar). Comes from the feature (i18n).
       */
      label: string;
      decorative?: undefined;
    }
  | {
      label?: undefined;
      /** Purely visual: another element (a busy button, a live Message) already says it. */
      decorative: true;
    };

export type ProgressSpinnerProps = ProgressSemantics & {
  /** `inherit` is 1em of the surrounding text, as in a button's icon slot. */
  size?: 'inherit' | SpinnerSize;
  /** Shows the label next to the spinner instead of only announcing it. */
  showLabel?: boolean;
};

/**
 * An indeterminate spinner: the animated icon in the current text color. Labelled, it is a polite
 * status announced once; decorative, it is hidden from assistive technology. Drawn by the
 * GlSurface it's in (ProgressSpinnerGl), or as DOM (ProgressSpinnerDom).
 */
export function ProgressSpinner(props: ProgressSpinnerProps) {
  return useRenderMode() === 'gl' ? (
    <ProgressSpinnerGl {...props} />
  ) : (
    <ProgressSpinnerDom {...props} />
  );
}

export type ProgressBarProps = ProgressSemantics & {
  /** Completed share, from 0 to 1. Clamped. */
  value: number;
  /** The value in words or figures, formatted by the feature (i18n): "42%", "3 of 8 pieces". */
  valueText?: string;
  /** Shows the label and value text above the bar. */
  showLabel?: boolean;
  /** `sm` is the hairline used in tiles and lists; `lg` stands on its own. */
  size?: 'sm' | 'lg';
};

/**
 * A determinate bar in the brand color, filled by `scaleX` so updates only composite. Labelled, it
 * is a `progressbar` with its value; decorative (a tile's watched share), it is hidden.
 */
export function ProgressBar({
  label,
  value,
  valueText,
  showLabel = false,
  size = 'sm',
}: ProgressBarProps) {
  const share = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const track = (
    <div className={styles.track} data-size={size}>
      <div className={styles.fill} style={{ transform: `scaleX(${share})` }} />
    </div>
  );
  if (label === undefined) {
    return (
      <div className={styles.bar} aria-hidden="true">
        {track}
      </div>
    );
  }
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={valueText}
      className={styles.bar}
    >
      {showLabel && (
        <div className={styles.barHeader} aria-hidden="true">
          <span>{label}</span>
          {valueText && <span className={styles.barValue}>{valueText}</span>}
        </div>
      )}
      {track}
    </div>
  );
}
