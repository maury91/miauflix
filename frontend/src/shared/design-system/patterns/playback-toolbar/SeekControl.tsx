import { useId } from 'react';

import { visuallyHidden } from '../../a11y.css';
import { Slider } from '../../slider/Slider';
import * as styles from './playback.css';
import type { SeekRange } from './seekRanges';

import PawIcon from '~icons/mdi/paw';

export interface SeekControlProps {
  /** The bar's name ("Seek"). From the feature (i18n), like every text here. */
  label: string;
  /** Where playback is, in seconds. */
  position: number;
  /** The length, in seconds; 0 while unknown (the bar is then disabled). */
  duration: number;
  /** Called with the position asked for. When to commit (on each step, after a pause) is the player's call. */
  onSeek: (position: number) => void;
  /** One arrow press, in seconds: 10 by default. */
  keyStep?: number;
  /** The position in words for assistive technology ("12 minutes 4 seconds of 1 hour 42"). */
  valueText: string;
  /** Shown before the bar ("12:04"). */
  elapsedText?: string;
  /** Shown after the bar ("-1:30:06" or "1:42:10"). */
  remainingText?: string;
  /** The downloaded stretches of the playing file (see `piecesToRanges`), drawn as light blocks. */
  downloaded?: readonly SeekRange[];
  disabled?: boolean;
}

const clampShare = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The player's seek bar: a Slider in the brand colour with Miauflix's paw as its thumb, the
 * downloaded blocks under the watched fill and the times at its ends. Not a stop for the remote:
 * the toolbar's primary control (play/pause, beside it) seeks with Left/Right. A mouse drags it
 * and previews up to the pointer; Tab reaches it, and its arrows then seek by `keyStep`. The
 * player adapter owns playback and the downloaded data.
 */
export function SeekControl({
  label,
  position,
  duration,
  onSeek,
  keyStep = 10,
  valueText,
  elapsedText,
  remainingText,
  downloaded,
  disabled = false,
}: SeekControlProps) {
  const id = useId();
  const known = duration > 0;
  return (
    <div className={styles.seek}>
      {elapsedText !== undefined && (
        <span className={styles.time} data-edge="start" aria-hidden="true">
          {elapsedText}
        </span>
      )}
      <div className={styles.bar}>
        <span id={`${id}-label`} className={visuallyHidden}>
          {label}
        </span>
        <Slider
          id={`${id}-input`}
          navId={id}
          tabOnly
          aria-labelledby={`${id}-label`}
          value={known ? Math.min(position, duration) : 0}
          onChange={onSeek}
          min={0}
          max={known ? duration : 1}
          step={0.001}
          keyStep={keyStep}
          valueText={valueText}
          tone="brand"
          disabled={disabled || !known}
          pointerPreview
          thumb={<PawIcon className={styles.paw} />}
          trackLayers={downloaded?.map(range => (
            <span
              key={range.start}
              className={styles.downloaded}
              style={{
                left: `${clampShare(range.start) * 100}%`,
                width: `${(clampShare(range.end) - clampShare(range.start)) * 100}%`,
              }}
            />
          ))}
        />
      </div>
      {remainingText !== undefined && (
        <span className={styles.time} data-edge="end" aria-hidden="true">
          {remainingText}
        </span>
      )}
    </div>
  );
}
