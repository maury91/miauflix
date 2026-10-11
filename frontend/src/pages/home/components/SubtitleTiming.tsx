import { PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { type RefObject, useEffect, useState } from 'react';
import styled from 'styled-components';

import ArrowRightIcon from '~icons/mdi/arrow-right';

export interface SubtitleTimingCue {
  start: number;
  end: number;
  text: string;
}

const Preview = styled.div`
  position: relative;
  height: 16rem;
  overflow: hidden;
  border-radius: 0.35rem;
  background: ${PALETTE.background.surface1};
`;
const Now = styled.div`
  position: absolute;
  top: 50%;
  left: 0.5rem;
  right: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  transform: translateY(-50%);
  color: ${PALETTE.color.brand};
  font-size: 0.8rem;
  pointer-events: none;
  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
  &::after {
    content: '';
    flex: 1;
    border-top: 1px solid ${PALETTE.background.border};
  }
`;
const Line = styled.div<{ $distance: number; $active: boolean }>`
  position: absolute;
  top: 50%;
  left: 4rem;
  right: 0.5rem;
  transform: translateY(calc(-50% + ${({ $distance }) => $distance}rem));
  transition: transform 0.1s linear;
  color: ${({ $active }) => ($active ? PALETTE.text.primary : PALETTE.text.secondary)};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  font-size: 0.9rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
  background: ${PALETTE.background.surface1};
`;
const Adjustment = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  input {
    width: 100%;
    min-width: 0;
    accent-color: ${PALETTE.color.brand};
  }
`;
const Range = styled.div`
  display: flex;
  justify-content: space-between;
  color: ${PALETTE.text.secondary};
  font-size: 0.8rem;
`;
// eslint-disable-next-line no-restricted-syntax -- Existing media/player timing interaction; see shared/ui/README.md.
const StepButton = styled(BaseButton)`
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  background: ${PALETTE.background.input};
  color: ${PALETTE.text.primary};
  font-size: 1.5rem;
  box-shadow: none;
`;

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

export function SubtitleTiming({
  cues,
  videoRef,
  pendingPosition,
  offset,
  onOffsetChange,
}: {
  cues: SubtitleTimingCue[];
  videoRef?: RefObject<HTMLVideoElement | null>;
  pendingPosition?: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
}) {
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
      <Preview role="group" aria-label="Subtitle timing preview">
        <Now aria-label="Now">
          <span>Now</span>
          <ArrowRightIcon aria-hidden="true" />
        </Now>
        {timingLines(cues, now, offset).map(({ cue, index, active, displacement }) => (
          <Line key={index} $distance={displacement} $active={active} data-current={active}>
            {cue.text}
          </Line>
        ))}
        {!cues.length && (
          <Line $distance={0} $active={false}>
            Loading subtitle preview…
          </Line>
        )}
      </Preview>
      <p id="subtitle-offset-label">Timing adjustment: {seconds(offset)}</p>
      <Adjustment>
        <StepButton
          type="button"
          aria-label="Subtitles 5 seconds earlier"
          onClick={() => shift(-5)}
        >
          −
        </StepButton>
        <input
          type="range"
          min={min}
          max={max}
          step={0.25}
          value={offset}
          aria-label="Subtitle timing adjustment"
          aria-valuetext={`${offset > 0 ? 'later' : offset < 0 ? 'earlier' : 'no adjustment'}, ${Math.abs(offset).toFixed(2)} seconds`}
          onChange={event => onOffsetChange(Number(event.target.value))}
        />
        <StepButton type="button" aria-label="Subtitles 5 seconds later" onClick={() => shift(5)}>
          +
        </StepButton>
      </Adjustment>
      <Range aria-label="Timing adjustment range">
        <span>{seconds(min)}</span>
        <span>{seconds(max)}</span>
      </Range>
    </section>
  );
}
