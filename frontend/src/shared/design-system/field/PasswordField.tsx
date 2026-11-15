import {
  forwardRef,
  type InputHTMLAttributes,
  type MouseEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { IconButton } from '../icon-button/IconButton';
import { type NavigableProps, useNavComposite } from '../navFocus';
import type { ControlSize } from '../tokens';
import { Field, type FieldAnatomyProps } from './Field';
import * as styles from './field.css';
import { fieldActionSize } from './fieldParts';
import { InputFrame } from './InputFrame';

import HideIcon from '~icons/mdi/eye-off-outline';
import ShowIcon from '~icons/mdi/eye-outline';

export type PasswordFieldPart = 'input' | 'reveal';

export type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'size' | 'type' | 'children' | 'id' | 'aria-invalid'
> &
  FieldAnatomyProps &
  NavigableProps & {
    size?: ControlSize;
    /** The part holding virtual focus: the input (outline) or the reveal toggle (white fill). */
    focusedPart?: PasswordFieldPart;
    /** Called when the pointer moves onto a part, so the navigation layer can focus it. */
    onPointerFocus?: (part: PasswordFieldPart) => void;
    /** Accessible name of the reveal toggle while the password is hidden, e.g. "Show password". */
    showLabel: string;
    /** Accessible name of the reveal toggle while the password is shown, e.g. "Hide password". */
    hideLabel: string;
  };

/**
 * A password: TextField internals plus the standard reveal IconButton. Revealing keeps the value,
 * the caret and edit mode; Right moves from the input to the toggle and Left comes back.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    {
      label,
      indicator,
      description,
      error,
      id,
      size = 'md',
      focusedPart: focusedPartProp,
      onPointerFocus: onPointerFocusProp,
      navId,
      showLabel,
      hideLabel,
      disabled = false,
      readOnly = false,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) {
    const [revealed, setRevealed] = useState(false);
    const nav = useNavComposite<PasswordFieldPart, HTMLDivElement>(
      navId,
      disabled ? ['input'] : ['input', 'reveal'],
      { focusedPart: focusedPartProp, onPointerFocus: onPointerFocusProp, disabled }
    );
    const { focusedPart, onPointerFocus } = nav;
    const inputRef = useRef<HTMLInputElement>(null);
    const selection = useRef<[number | null, number | null] | null>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const toggle = () => {
      const input = inputRef.current;
      if (input && document.activeElement === input) {
        selection.current = [input.selectionStart, input.selectionEnd];
      }
      setRevealed(value => !value);
    };

    // Switching the input type can reset the selection; put the caret back where it was
    useLayoutEffect(() => {
      const input = inputRef.current;
      const saved = selection.current;
      selection.current = null;
      if (input && saved && document.activeElement === input) {
        input.setSelectionRange(saved[0], saved[1]);
      }
    }, [revealed]);

    // A press on the toggle keeps DOM focus (and edit mode) in the input
    const keepEditing = (event: MouseEvent) => event.preventDefault();

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
            onPointerFocus={() => onPointerFocus('input')}
            frameRef={nav.ref}
            end={
              <IconButton
                size={fieldActionSize[size]}
                label={revealed ? hideLabel : showLabel}
                icon={revealed ? <HideIcon /> : <ShowIcon />}
                pressed={revealed}
                focused={focusedPart === 'reveal'}
                disabled={disabled}
                aria-controls={control.id}
                data-nav-part="reveal"
                onMouseMove={() => onPointerFocus('reveal')}
                onMouseDown={keepEditing}
                onClick={toggle}
              />
            }
          >
            <input
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...props}
              {...control}
              ref={inputRef}
              type={revealed ? 'text' : 'password'}
              disabled={disabled}
              readOnly={readOnly}
              className={styles.control}
            />
          </InputFrame>
        )}
      </Field>
    );
  }
);
