import {
  type FocusEvent,
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  useState,
} from 'react';

import { IconButton } from '../icon-button/IconButton';
import { type NavigableProps, useNavComposite } from '../navFocus';
import type { ControlSize } from '../tokens';
import { Field, type FieldAnatomyProps } from './Field';
import * as styles from './field.css';
import { fieldActionSize } from './fieldParts';
import { InputFrame } from './InputFrame';

import MinusIcon from '~icons/mdi/minus';
import PlusIcon from '~icons/mdi/plus';

export type NumberFieldPart = 'decrement' | 'input' | 'increment';

type StepperProps =
  | {
      /** Accessible name of the decrement step, e.g. "Decrease". Adds the − and + actions. */
      decrementLabel: string;
      /** Accessible name of the increment step, e.g. "Increase". */
      incrementLabel: string;
    }
  | { decrementLabel?: undefined; incrementLabel?: undefined };

export type NumberFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | 'className'
  | 'style'
  | 'size'
  | 'type'
  | 'children'
  | 'id'
  | 'aria-invalid'
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'min'
  | 'max'
  | 'step'
> &
  FieldAnatomyProps &
  NavigableProps &
  StepperProps & {
    /** Controlled value; `null` when empty. */
    value: number | null;
    /** Called with a parsed, clamped value when an edit is committed or a step is taken. */
    onChange: (value: number | null) => void;
    min?: number;
    max?: number;
    /** Step of the − and + actions. Its decimals set the value's precision. */
    step?: number;
    /** Turns the value into text. The feature passes its locale's formatter (i18n). */
    formatValue?: (value: number) => string;
    /** Turns typed text into a number, or NaN. Pairs with `formatValue`. */
    parseValue?: (text: string) => number;
    size?: ControlSize;
    /** The part holding virtual focus: a step (white fill) or the input (outline). */
    focusedPart?: NumberFieldPart;
    /** Called when the pointer moves onto a part, so the navigation layer can focus it. */
    onPointerFocus?: (part: NumberFieldPart) => void;
  };

/** Decimal places of a step, including exponent notation (`1e-7` has 7, `1.5e-3` has 4). */
const decimalsOf = (value: number) => {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const dot = mantissa.indexOf('.');
  const fraction = dot === -1 ? 0 : mantissa.length - dot - 1;
  return Math.min(100, Math.max(0, fraction - Number(exponent)));
};

/**
 * A number, typed or stepped. Typing is free while editing and committed when editing ends (or on
 * Enter): empty means `null`, unreadable text reverts, out-of-range values are clamped. The steps
 * sit around the input: Left/Right move decrement → input → increment (style guide, section 9).
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  {
    label,
    indicator,
    description,
    error,
    id,
    value,
    onChange,
    min,
    max,
    step = 1,
    formatValue = String,
    parseValue = Number,
    decrementLabel,
    incrementLabel,
    size = 'md',
    focusedPart: focusedPartProp,
    onPointerFocus: onPointerFocusProp,
    navId,
    disabled = false,
    readOnly = false,
    onFocus,
    onBlur,
    onKeyDown,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref
) {
  // The text being typed, while editing; otherwise the input shows the formatted value
  const [draft, setDraft] = useState<string | null>(null);
  const formatted = value === null ? '' : formatValue(value);

  const clamp = (next: number) => {
    const precision = decimalsOf(step);
    const rounded = Number(next.toFixed(precision));
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded));
  };

  const commit = (text: string) => {
    // Text left as shown is no edit: committing it would round a stored value to the step
    if (text === formatted) return;
    const trimmed = text.trim();
    if (trimmed === '') {
      if (value !== null) onChange(null);
      return;
    }
    const parsed = parseValue(trimmed);
    if (!Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (next !== value) onChange(next);
  };

  const stepBy = (direction: 1 | -1) => {
    // While editing, step from what is typed and keep showing the result
    const typed = draft === null || draft.trim() === '' ? NaN : parseValue(draft.trim());
    const base = Number.isFinite(typed) ? typed : (value ?? min ?? 0);
    const next = clamp(base + direction * step);
    if (draft !== null) setDraft(formatValue(next));
    if (next !== value) onChange(next);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setDraft(formatted);
    onFocus?.(event);
  };
  // Read-only and disabled fields never commit: the draft is only the shown value
  const editable = !readOnly && !disabled;
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (draft !== null && editable) commit(draft);
    setDraft(null);
    onBlur?.(event);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && draft !== null && editable) {
      commit(draft);
      setDraft(null);
    }
  };

  // A press on a step keeps DOM focus (and edit mode) in the input
  const keepEditing = (event: MouseEvent) => event.preventDefault();
  const steppers = decrementLabel !== undefined;
  const stepDisabled = disabled || readOnly;
  const nav = useNavComposite<NumberFieldPart, HTMLDivElement>(
    navId,
    stepDisabled ? ['input'] : ['decrement', 'input', 'increment'],
    { focusedPart: focusedPartProp, onPointerFocus: onPointerFocusProp, disabled }
  );
  const { focusedPart, onPointerFocus } = nav;
  const actionSize = fieldActionSize[size];
  const negativeAllowed = min === undefined || min < 0;

  return (
    <Field
      label={label}
      indicator={indicator}
      description={description}
      error={error}
      id={id}
      aria-describedby={ariaDescribedBy}
    >
      {control => (
        <InputFrame
          size={size}
          focused={focusedPart === 'input'}
          invalid={Boolean(error)}
          disabled={disabled}
          readOnly={readOnly}
          centered={steppers}
          onPointerFocus={() => onPointerFocus('input')}
          frameRef={nav.ref}
          start={
            steppers && (
              <IconButton
                size={actionSize}
                label={decrementLabel}
                icon={<MinusIcon />}
                focused={focusedPart === 'decrement'}
                disabled={stepDisabled}
                aria-controls={control.id}
                onMouseMove={() => onPointerFocus('decrement')}
                onMouseDown={keepEditing}
                onClick={() => stepBy(-1)}
              />
            )
          }
          end={
            steppers && (
              <IconButton
                size={actionSize}
                label={incrementLabel}
                icon={<PlusIcon />}
                focused={focusedPart === 'increment'}
                disabled={stepDisabled}
                aria-controls={control.id}
                onMouseMove={() => onPointerFocus('increment')}
                onMouseDown={keepEditing}
                onClick={() => stepBy(1)}
              />
            )
          }
        >
          <input
            autoComplete="off"
            {...props}
            {...control}
            ref={ref}
            type="text"
            inputMode={Number.isInteger(step) && !negativeAllowed ? 'numeric' : 'decimal'}
            value={draft ?? formatted}
            disabled={disabled}
            readOnly={readOnly}
            className={styles.control}
            onChange={event => setDraft(event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        </InputFrame>
      )}
    </Field>
  );
});
