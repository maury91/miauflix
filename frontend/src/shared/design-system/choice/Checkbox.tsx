import { forwardRef, type InputHTMLAttributes, type ReactNode, useEffect, useRef } from 'react';

import { joinIds } from '../ids';
import * as styles from './choice.css';
import { ChoiceError, ChoiceFrame, type ChoiceProps } from './ChoiceFrame';
import { useChoiceIds } from './useChoiceIds';

import CheckIcon from '~icons/mdi/check-bold';
import MixedIcon from '~icons/mdi/minus-thick';

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'children' | 'size'
> &
  ChoiceProps & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    /** Some of the items it controls are checked. Shown as a dash; a press checks all. */
    indeterminate?: boolean;
    /** Validation message below the choice, with an icon. */
    error?: ReactNode;
  };

/**
 * A boolean choice that is part of a form or a list (several can be on at once). For a setting that
 * applies at once, use Switch. Confirm toggles it; arrows never do (style guide, section 9).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    error,
    focused,
    onPointerFocus,
    navId,
    checked,
    onCheckedChange,
    indeterminate = false,
    disabled = false,
    'aria-describedby': callerDescribedBy,
    ...props
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { labelId, descriptionId, errorId, describedBy } = useChoiceIds(description, error);

  // `indeterminate` exists only as a DOM property
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div>
      <ChoiceFrame
        label={label}
        description={description}
        descriptionId={descriptionId}
        labelId={labelId}
        focused={focused}
        navId={navId}
        onPointerFocus={onPointerFocus}
        checked={checked}
        mixed={indeterminate}
        invalid={Boolean(error)}
        disabled={disabled}
        indicator={
          <span className={styles.checkbox}>
            {indeterminate ? <MixedIcon /> : checked ? <CheckIcon /> : null}
            <input
              {...props}
              ref={node => {
                inputRef.current = node;
                if (typeof ref === 'function') ref(node);
                else if (ref) ref.current = node;
              }}
              type="checkbox"
              className={styles.nativeInput}
              checked={checked}
              disabled={disabled}
              aria-labelledby={labelId}
              aria-describedby={joinIds(callerDescribedBy, describedBy)}
              aria-invalid={error ? true : undefined}
              onChange={event => {
                // Activating a mixed checkbox checks all; the native toggle would report false
                onCheckedChange(indeterminate ? true : event.target.checked);
                // Activation clears the native mixed state. Put it back: an owner keeping
                // `indeterminate` may not re-render, and if it changes it the effect follows
                event.target.indeterminate = indeterminate;
              }}
            />
          </span>
        }
      />
      <ChoiceError id={errorId}>{error}</ChoiceError>
    </div>
  );
});
