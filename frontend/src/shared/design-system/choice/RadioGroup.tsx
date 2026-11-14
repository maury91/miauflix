import { type ReactNode, useId } from 'react';

import * as fieldStyles from '../field/field.css';
import * as styles from './choice.css';
import { ChoiceError, ChoiceFrame } from './ChoiceFrame';
import { useChoiceIds } from './useChoiceIds';

export interface RadioOption<Value extends string = string> {
  value: Value;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<Value extends string = string> {
  /** The question the choices answer; the group's accessible name. */
  label: string;
  /** Short text next to the label, such as a translated "Optional". */
  indicator?: string;
  /** Help below the label. Not a focus target. */
  description?: ReactNode;
  /** Validation message below the choices, with an icon. */
  error?: ReactNode;
  options: readonly RadioOption<Value>[];
  /** The chosen value; `null` before a choice. */
  value: Value | null;
  onChange: (value: Value) => void;
  /** Vertical moves with Up/Down, horizontal with Left/Right (style guide, section 9). */
  orientation?: 'vertical' | 'horizontal';
  /** The option holding virtual focus (outline). Confirm selects it: focus never selects. */
  focusedValue?: Value;
  /** Called when the pointer moves onto an option, so the navigation layer can focus it. */
  onPointerFocus?: (value: Value) => void;
  /** Form field name. Generated when not given. */
  name?: string;
  disabled?: boolean;
}

/**
 * One choice among a few visible options. Moving focus never changes the choice; Confirm (or a
 * press) selects the focused option, as TV manual activation requires. Use Select when the list is
 * long or space is tight.
 */
export function RadioGroup<Value extends string = string>({
  label,
  indicator,
  description,
  error,
  options,
  value,
  onChange,
  orientation = 'vertical',
  focusedValue,
  onPointerFocus,
  name,
  disabled = false,
}: RadioGroupProps<Value>) {
  const generatedName = useId();
  const { descriptionId, errorId, describedBy } = useChoiceIds(description, error);
  return (
    <fieldset
      className={styles.group}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className={fieldStyles.labelRow}>
        <span className={fieldStyles.label}>{label}</span>
        {indicator && <span className={fieldStyles.indicator}>{indicator}</span>}
      </legend>
      {description && (
        <p id={descriptionId} className={fieldStyles.description}>
          {description}
        </p>
      )}
      <div className={styles.options} data-orientation={orientation}>
        {options.map(option => {
          const optionDisabled = disabled || Boolean(option.disabled);
          const optionId = `${generatedName}-${option.value}`;
          return (
            <div key={option.value} className={styles.option}>
              <ChoiceFrame
                label={option.label}
                description={option.description}
                labelId={`${optionId}-label`}
                descriptionId={option.description ? `${optionId}-description` : undefined}
                focused={focusedValue === option.value}
                onPointerFocus={() => onPointerFocus?.(option.value)}
                checked={value === option.value}
                invalid={Boolean(error)}
                disabled={optionDisabled}
                indicator={
                  <span className={styles.radio}>
                    <span className={styles.radioDot} />
                    <input
                      type="radio"
                      name={name ?? generatedName}
                      aria-labelledby={`${optionId}-label`}
                      aria-describedby={option.description ? `${optionId}-description` : undefined}
                      value={option.value}
                      checked={value === option.value}
                      disabled={optionDisabled}
                      className={styles.nativeInput}
                      onChange={() => onChange(option.value)}
                    />
                  </span>
                }
              />
            </div>
          );
        })}
      </div>
      <ChoiceError id={errorId}>{error}</ChoiceError>
    </fieldset>
  );
}
