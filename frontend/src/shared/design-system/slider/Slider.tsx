import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from 'react';

import { joinIds } from '../ids';
import { type NavigableProps, useNavFocus } from '../navFocus';
import { useSurfaceContext } from '../surface';
import * as styles from './slider.css';
import { sliderShare, snapSliderValue, stepSliderValue } from './sliderValue';

export interface SliderMark {
  value: number;
  /** Shown under the track, e.g. "Small" and "Large" at the ends. Comes from the feature (i18n). */
  label?: string;
}

interface SliderBaseProps extends NavigableProps {
  value: number;
  /** Called with the new value, already on the step grid and within the limits. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** The value grid, also used when dragging. */
  step?: number;
  /** One arrow press under virtual focus. Defaults to `step` (the player seeks by 10 s). */
  keyStep?: number;
  /**
   * The value in words or figures, formatted by the feature (i18n): "120%", "1:24:05". Shown next
   * to the label and read by assistive technology instead of the bare number.
   */
  valueText?: string;
  /** Ticks under the track, optionally labelled. */
  marks?: readonly SliderMark[];
  disabled?: boolean;
  /** Virtual focus (white outline), from the navigation layer. While set, it owns Left/Right. */
  focused?: boolean;
  /** Called when the pointer moves onto the slider. */
  onPointerFocus?: () => void;
  /** `brand` fills in the brand colour: the player's seek bar only (style guide, section 3). */
  tone?: 'neutral' | 'brand';
  /**
   * Decorative layers on the track, under the fill and spanning the same rail as the thumb (a seek
   * bar's downloaded blocks). Position children by a share of the width.
   */
  trackLayers?: ReactNode;
  /**
   * A decorative glyph drawn in place of the round thumb, centred on the value and coloured like
   * the fill (the seek bar's paw). Size it with `font-size`; the native thumb keeps its size.
   */
  thumb?: ReactNode;
}

/** Labelled by its own label above the track… */
type LabelledProps = {
  label: string;
  description?: string;
  id?: string;
  'aria-labelledby'?: undefined;
  'aria-describedby'?: undefined;
};

/** …or by a row around it, such as SettingRow's `control` props. */
type RowLabelledProps = {
  label?: undefined;
  description?: undefined;
  id: string;
  'aria-labelledby': string;
  'aria-describedby'?: string;
};

export type SliderProps = SliderBaseProps & (LabelledProps | RowLabelledProps);

/**
 * A row may name its control with the title and the control's own text (SettingRow's "<title>
 * <own text>"); a slider has no text of its own, so naming itself would read its value twice.
 */
const ownName = (labelledBy: string | undefined, id: string) =>
  labelledBy
    ?.split(' ')
    .filter(part => part && part !== id)
    .join(' ') || undefined;

/**
 * A value in a range, horizontal. While it has virtual focus it owns Left/Right: each press
 * adjusts by `keyStep`, mirrored for right-to-left text, and clamps at the limits instead of
 * exiting; Up/Down stay with the navigation layer. Held keys repeat at the keyboard's rate. The
 * native range input lies invisibly over the drawing, so dragging, touch, desktop keys and
 * assistive technology are native. What the value means (seeking, volume) stays with the feature.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  keyStep = step,
  valueText,
  marks,
  disabled = false,
  focused: focusedProp = false,
  onPointerFocus,
  tone = 'neutral',
  trackLayers,
  thumb,
  navId,
  label,
  description,
  id: idProp,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
}: SliderProps) {
  const surface = useSurfaceContext();
  const ownId = useId();
  const id = idProp ?? ownId;
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const rootRef = useRef<HTMLDivElement>(null);
  const nav = useNavFocus<HTMLDivElement>(navId, { focused: focusedProp, disabled }, rootRef);
  const focused = nav.focused;
  const range = { min, max, step };
  const current = snapSliderValue(value, range);
  const share = sliderShare(current, range);

  const latest = useRef({ current, range, keyStep, onChange });
  // Published on commit: the key handler never reads a render React discarded
  useLayoutEffect(() => {
    latest.current = { current, range, keyStep, onChange };
  });

  // Component-intrinsic keys come before navigation (style guide, section 10)
  useEffect(() => {
    if (!focused || disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const keyAction = getKeyboardAction(event);
      if (keyAction !== 'left' && keyAction !== 'right') return;
      const root = rootRef.current;
      // Another native control has DOM focus (Tab moved it there): its keys are its own
      const target = event.target;
      const otherControl =
        target instanceof HTMLElement &&
        !root?.contains(target) &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable);
      if (otherControl) return;
      event.preventDefault();
      event.stopPropagation();
      const rtl = root ? getComputedStyle(root).direction === 'rtl' : false;
      const towardEnd = (keyAction === 'right') !== rtl;
      const { current, range, keyStep, onChange } = latest.current;
      const next = stepSliderValue(current, towardEnd ? 1 : -1, range, keyStep);
      if (next !== current) onChange(next);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [focused, disabled]);

  const markPosition = (markValue: number) => {
    const markShare = sliderShare(markValue, range);
    // On the rail, which starts and ends half a thumb in from the track's ends
    return `calc(${styles.thumbSize / 2}rem + ${markShare} * (100% - ${styles.thumbSize}rem))`;
  };
  const labelledMarks = marks?.filter(mark => mark.label);

  return (
    <div
      ref={nav.ref}
      className={styles.root}
      data-surface={surface}
      data-tone={tone === 'brand' ? tone : undefined}
      data-focused={focused || undefined}
      data-disabled={disabled || undefined}
    >
      {label !== undefined && (
        <div className={styles.header}>
          <label id={labelId} htmlFor={id} className={styles.label}>
            {label}
          </label>
          {valueText && (
            // The input announces its value itself
            <span className={styles.value} aria-hidden="true">
              {valueText}
            </span>
          )}
        </div>
      )}
      {description && (
        <span id={descriptionId} className={styles.description}>
          {description}
        </span>
      )}
      <div
        className={styles.control}
        onMouseMove={() => {
          nav.onPointerFocus();
          onPointerFocus?.();
        }}
      >
        <div className={styles.drawing} aria-hidden="true">
          <span className={styles.track}>
            <span className={styles.fillCap} />
            {trackLayers && <span className={styles.rail}>{trackLayers}</span>}
            <span className={styles.rail}>
              <span className={styles.fill} style={{ transform: `scaleX(${share})` }} />
            </span>
          </span>
          {marks?.map(mark => (
            <span
              key={mark.value}
              className={styles.tick}
              style={{ left: markPosition(mark.value) }}
            />
          ))}
          <span className={styles.rail}>
            <span
              className={styles.thumbPosition}
              style={{ transform: `translateX(${share * 100}%)` }}
            >
              {thumb ? (
                <span className={styles.thumbGlyph}>{thumb}</span>
              ) : (
                <span className={styles.thumb} />
              )}
            </span>
          </span>
        </div>
        <input
          id={id}
          type="range"
          className={styles.nativeInput}
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          aria-labelledby={label !== undefined ? labelId : ownName(labelledBy, id)}
          aria-describedby={joinIds(description && descriptionId, describedBy)}
          aria-valuetext={valueText}
          onChange={event => {
            const next = snapSliderValue(event.target.valueAsNumber, range);
            if (next !== current) onChange(next);
          }}
        />
      </div>
      {labelledMarks && labelledMarks.length > 0 && (
        <div className={styles.markLabels} aria-hidden="true">
          {labelledMarks.map(mark => {
            const markShare = sliderShare(mark.value, range);
            const edge = markShare === 0 ? 'start' : markShare === 1 ? 'end' : undefined;
            return (
              <span
                key={mark.value}
                className={styles.markLabel}
                data-edge={edge}
                style={{
                  left: edge === 'start' ? 0 : edge === 'end' ? '100%' : markPosition(mark.value),
                }}
              >
                <span className={styles.markText}>{mark.label}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
