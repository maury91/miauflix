import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { joinIds } from '../ids';
import * as styles from './choice.css';
import { ChoiceFrame, type ChoiceProps } from './ChoiceFrame';
import { useChoiceIds } from './useChoiceIds';

export type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'type' | 'role' | 'aria-checked' | 'onChange' | 'children'
> &
  ChoiceProps & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };

/**
 * A setting that applies at once, never navigation or submission. Name the setting, not the action
 * ("Episode syncing", not "Turn on"), and keep the label stable as the value changes. The switch
 * sits at the far end of the row. Confirm toggles it; arrows never do (style guide, section 9).
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    label,
    description,
    focused,
    onPointerFocus,
    checked,
    onCheckedChange,
    disabled = false,
    onClick,
    'aria-describedby': callerDescribedBy,
    ...props
  },
  ref
) {
  const { labelId, descriptionId, describedBy } = useChoiceIds(description, undefined);
  return (
    <ChoiceFrame
      label={label}
      description={description}
      descriptionId={descriptionId}
      labelId={labelId}
      focused={focused}
      onPointerFocus={onPointerFocus}
      checked={checked}
      disabled={disabled}
      indicatorAtEnd
      indicator={
        <span className={styles.track}>
          <span className={styles.thumb} />
          <button
            {...props}
            ref={ref}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelId}
            aria-describedby={joinIds(callerDescribedBy, describedBy)}
            disabled={disabled}
            className={styles.nativeInput}
            onClick={event => {
              onClick?.(event);
              if (!event.defaultPrevented) onCheckedChange(!checked);
            }}
          />
        </span>
      }
    />
  );
});
