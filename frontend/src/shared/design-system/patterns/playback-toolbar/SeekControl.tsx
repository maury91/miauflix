import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';

import { visuallyHidden } from '../../a11y.css';
import { Slider } from '../../slider/Slider';
import { thumbSize } from '../../slider/slider.css';
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
  /**
   * Drawn above the bar over the point a mouse hovers, with that point's time in seconds (a frame
   * of the video there). Remote and touch see nothing of it.
   */
  hoverPreview?: (seconds: number) => ReactNode;
  disabled?: boolean;
}

const clampShare = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The player's seek bar: a Slider in the brand colour with Miauwatch's paw as its thumb, the
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
  hoverPreview,
  disabled = false,
}: SeekControlProps) {
  const id = useId();
  const known = duration > 0;
  const bar = useRef<HTMLDivElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  // The share a mouse hovers, null while none does
  const [hoverShare, setHoverShare] = useState<number | null>(null);
  const showPreview = hoverPreview && known && hoverShare !== null;
  // Placed once mounted, before paint: its width is only known then
  useLayoutEffect(() => {
    const box = previewBox.current;
    const width = bar.current?.clientWidth ?? 0;
    if (!box || hoverShare === null || !width) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const thumb = thumbSize * rem;
    const half = box.offsetWidth / 2;
    // Over the hovered point on the thumb's rail, kept within the bar
    const point = thumb / 2 + hoverShare * (width - thumb);
    const rtl = getComputedStyle(bar.current!).direction === 'rtl';
    const fromStart = Math.min(width - half, Math.max(half, rtl ? width - point : point));
    box.style.transform = `translateX(${fromStart - half}px)`;
  }, [hoverShare, showPreview]);
  return (
    <div className={styles.seek}>
      {elapsedText !== undefined && (
        <span className={styles.time} data-edge="start" aria-hidden="true">
          {elapsedText}
        </span>
      )}
      <div ref={bar} className={styles.bar}>
        {showPreview && (
          <div ref={previewBox} className={styles.hoverPreview} aria-hidden="true">
            {hoverPreview(hoverShare * duration)}
          </div>
        )}
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
          onPointerPreviewChange={hoverPreview ? setHoverShare : undefined}
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
