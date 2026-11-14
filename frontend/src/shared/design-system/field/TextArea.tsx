import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { Field, type FieldAnatomyProps } from './Field';
import * as styles from './field.css';
import { type FieldStateProps, InputFrame } from './InputFrame';

export type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'style' | 'children' | 'id' | 'aria-invalid'
> &
  FieldAnatomyProps &
  FieldStateProps & {
    /** Visible lines; the user can make it taller on the web. */
    rows?: number;
  };

/**
 * Multiline text with the same Field anatomy and frame as TextField. While editing, Enter inserts
 * a new line and Back ends editing (style guide, section 9).
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    label,
    indicator,
    description,
    error,
    id,
    size = 'md',
    focused = false,
    onPointerFocus,
    rows = 3,
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
          onPointerFocus={onPointerFocus}
          multiline
        >
          <textarea
            {...props}
            {...control}
            ref={ref}
            rows={rows}
            disabled={disabled}
            readOnly={readOnly}
            className={`${styles.control} ${styles.multiline}`}
          />
        </InputFrame>
      )}
    </Field>
  );
});
