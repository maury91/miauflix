import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { Field, type FieldAnatomyProps } from './Field';
import * as styles from './field.css';
import { type FieldStateProps, InputFrame } from './InputFrame';

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'size' | 'type' | 'children' | 'id' | 'aria-invalid'
> &
  FieldAnatomyProps &
  FieldStateProps & {
    /** Single-line text kinds. Numbers use NumberField, passwords PasswordField. */
    type?: 'text' | 'email' | 'url' | 'tel';
    /** Decorative leading icon. */
    leading?: ReactNode;
    /**
     * One trailing IconButton of size `fieldActionSize[size]`. It carries its own `focused`: Right
     * moves from the input to it, Left comes back (style guide, section 9).
     */
    trailing?: ReactNode;
  };

/**
 * A single-line text field: Field anatomy around the shared input frame. The ref is the native
 * input, which takes DOM focus only in edit mode (caret, IME).
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    indicator,
    description,
    error,
    id,
    size = 'md',
    focused = false,
    onPointerFocus,
    type = 'text',
    leading,
    trailing,
    disabled = false,
    readOnly = false,
    ...props
  },
  ref
) {
  return (
    <Field label={label} indicator={indicator} description={description} error={error} id={id}>
      {control => (
        <InputFrame
          size={size}
          focused={focused}
          invalid={Boolean(error)}
          disabled={disabled}
          readOnly={readOnly}
          decoration={leading}
          end={trailing}
          onPointerFocus={onPointerFocus}
        >
          <input
            {...props}
            {...control}
            ref={ref}
            type={type}
            disabled={disabled}
            readOnly={readOnly}
            className={styles.control}
          />
        </InputFrame>
      )}
    </Field>
  );
});
