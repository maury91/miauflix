import type { PlayerMedia } from '@features/player/lib/avplay-media';
import { IconButton, Slider, Stack, Text } from '@shared/design-system';
import { visuallyHidden } from '@shared/design-system/a11y.css';
import { useOptionalNavigation } from '@shared/navigation';
import { type RefObject, useEffect, useState } from 'react';

import * as styles from './subtitleTiming.css';

import ArrowRightIcon from '~icons/mdi/arrow-right';
import MinusIcon from '~icons/mdi/minus';
import PlusIcon from '~icons/mdi/plus';

/** Navigation IDs inside the timing view. */
const SUBTITLE_TIMING_NAV = {
  earlier: 'subtitle-timing-earlier',
  offset: 'subtitle-timing-offset',
  later: 'subtitle-timing-later',
} as const;

export interface SubtitleTimingCue {
  start: number;
  end: number;
  text: string;
}

function seconds(value: number) {
  return `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}s`;
}

/** Find the active or closest cue and its two neighbors on the original movie clock. */
function timingLines(cues: SubtitleTimingCue[], now: number, offset: number) {
  const time = now - offset;
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].start <= time) low = middle + 1;
    else high = middle;
  }
  let center = Math.max(0, low - 1);
  if (
    center + 1 < cues.length &&
    time > cues[center].end &&
    cues[center + 1].start - time < time - cues[center].end
  )
    center++;
  const begin = Math.max(0, Math.min(center - 1, cues.length - 3));
  const lines = cues.slice(begin, begin + 3).map((cue, index) => {
    const active = time >= cue.start && time < cue.end;
    const distance = active ? 0 : time < cue.start ? cue.start - time : cue.end - time;
    return {
      cue,
      index: begin + index,
      active,
      displacement: (0.8 * distance) / (Math.abs(distance) + 5),
    };
  });
  const anchor = center - begin;
  // Keep each line readable even when all three cues are on the same side of Now.
  // Neighbor gaps retain temporal spacing, with long gaps compressed to fit the preview.
  const spacing = (left: SubtitleTimingCue, right: SubtitleTimingCue) => {
    const gap = Math.max(0, right.start - left.end);
    return 2.4 + (0.3 * gap) / (gap + 5);
  };
  for (let index = anchor + 1; index < lines.length; index++)
    lines[index].displacement =
      lines[index - 1].displacement + spacing(lines[index - 1].cue, lines[index].cue);
  for (let index = anchor - 1; index >= 0; index--)
    lines[index].displacement =
      lines[index + 1].displacement - spacing(lines[index].cue, lines[index + 1].cue);
  return lines;
}

/**
 * Moves the subtitles against the picture: a preview of the cues around now, a slider (Left/Right
 * by half a second, held by a second) and ±5 s buttons that also widen its range. It takes the
 * focus on the slider when it opens.
 */
export function SubtitleTiming({
  cues,
  videoRef,
  pendingPosition,
  offset,
  onOffsetChange,
}: {
  cues: SubtitleTimingCue[];
  videoRef?: RefObject<PlayerMedia | null>;
  pendingPosition?: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
}) {
  const navigation = useOptionalNavigation();
  useEffect(() => {
    navigation?.focus(SUBTITLE_TIMING_NAV.offset);
    // Once, on opening; the store's methods are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [now, setNow] = useState(() => pendingPosition ?? videoRef?.current?.currentTime ?? 0);
  const [bounds, setBounds] = useState(() => ({
    min: Math.min(-5, offset - 5),
    max: Math.max(5, offset + 5),
  }));
  useEffect(() => {
    const update = () => setNow(pendingPosition ?? videoRef?.current?.currentTime ?? 0);
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [videoRef, pendingPosition]);
  const min = Math.min(bounds.min, offset);
  const max = Math.max(bounds.max, offset);
  const shift = (amount: number) => {
    setBounds({ min: min + Math.min(0, amount), max: max + Math.max(0, amount) });
    onOffsetChange(offset + amount);
  };
  return (
    <section aria-label="Subtitle synchronization">
      <Stack gap="sm">
        <div className={styles.preview} role="group" aria-label="Subtitle timing preview">
          <div className={styles.now} aria-label="Now">
            <span>Now</span>
            <ArrowRightIcon className={styles.nowIcon} aria-hidden="true" />
          </div>
          {timingLines(cues, now, offset).map(({ cue, index, active, displacement }) => (
            <div
              key={index}
              className={styles.line}
              style={{ transform: `translateY(calc(-50% + ${displacement}rem))` }}
              data-current={active}
            >
              {cue.text}
            </div>
          ))}
          {!cues.length && (
            <div className={styles.line} style={{ transform: 'translateY(-50%)' }}>
              No subtitle cues near this position.
            </div>
          )}
        </div>
        <Text id="subtitle-offset-label">Timing adjustment: {seconds(offset)}</Text>
        <div className={styles.adjustment}>
          <IconButton
            navId={SUBTITLE_TIMING_NAV.earlier}
            label="Subtitles 5 seconds earlier"
            icon={<MinusIcon />}
            onClick={() => shift(-5)}
          />
          <div className={styles.slider}>
            <span id="subtitle-offset-name" className={visuallyHidden}>
              Subtitle timing adjustment
            </span>
            <Slider
              navId={SUBTITLE_TIMING_NAV.offset}
              id="subtitle-offset"
              aria-labelledby="subtitle-offset-name"
              min={min}
              max={max}
              step={0.25}
              keyStep={0.5}
              value={offset}
              valueText={`${offset > 0 ? 'later' : offset < 0 ? 'earlier' : 'no adjustment'}, ${Math.abs(offset).toFixed(2)} seconds`}
              onChange={onOffsetChange}
            />
          </div>
          <IconButton
            navId={SUBTITLE_TIMING_NAV.later}
            label="Subtitles 5 seconds later"
            icon={<PlusIcon />}
            onClick={() => shift(5)}
          />
        </div>
        <div className={styles.range} aria-label="Timing adjustment range">
          <span>{seconds(min)}</span>
          <span>{seconds(max)}</span>
        </div>
      </Stack>
    </section>
  );
}
