import { forwardRef, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent } from 'react';

import { IconButton } from '../icon-button/IconButton';
import { type NavigableProps, useNavComposite } from '../navFocus';
import type { ControlSize } from '../tokens';
import { Field, type FieldAnatomyProps } from './Field';
import * as styles from './field.css';
import { fieldActionSize } from './fieldParts';
import { InputFrame } from './InputFrame';

import SubmitIcon from '~icons/mdi/arrow-right';
import ClearIcon from '~icons/mdi/close';
import SearchIcon from '~icons/mdi/magnify';

export type SearchFieldPart = 'input' | 'clear' | 'submit';

type ClearProps =
  | {
      /** Adds the clear action, shown while there is text. Its room is kept when hidden. */
      onClear: () => void;
      /** Accessible name of the clear action, e.g. "Clear search". */
      clearLabel: string;
    }
  | { onClear?: undefined; clearLabel?: undefined };

type SubmitProps =
  | {
      /** Adds the submit action; Enter in the input submits too. */
      onSearch: (value: string) => void;
      /** Accessible name of the submit action, e.g. "Search". */
      submitLabel: string;
    }
  | { onSearch?: undefined; submitLabel?: undefined };

export type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'size' | 'type' | 'children' | 'id' | 'aria-invalid' | 'value'
> &
  FieldAnatomyProps &
  NavigableProps &
  ClearProps &
  SubmitProps & {
    /** Controlled: the clear action shows only while there is text. */
    value: string;
    size?: ControlSize;
    /** The part holding virtual focus. When clearing hides `clear`, move focus to `input`. */
    focusedPart?: SearchFieldPart;
    /** Called when the pointer moves onto a part, so the navigation layer can focus it. */
    onPointerFocus?: (part: SearchFieldPart) => void;
  };

/**
 * A search input with the same shell as TextField and optional clear and submit actions, in that
 * order: Left/Right move input → clear → submit, skipping absent actions (style guide, section 9).
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    label,
    indicator,
    description,
    error,
    id,
    value,
    size = 'md',
    focusedPart: focusedPartProp,
    onPointerFocus: onPointerFocusProp,
    navId,
    onClear,
    clearLabel,
    onSearch,
    submitLabel,
    disabled = false,
    readOnly = false,
    onKeyDown,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref
) {
  const actionSize = fieldActionSize[size];
  const canClear = value !== '' && !disabled && !readOnly;
  // Absent and unavailable actions are skipped (style guide, section 9)
  const parts: SearchFieldPart[] = ['input'];
  if (onClear && canClear) parts.push('clear');
  if (onSearch && !disabled) parts.push('submit');
  const nav = useNavComposite<SearchFieldPart, HTMLDivElement>(navId, parts, {
    focusedPart: focusedPartProp,
    onPointerFocus: onPointerFocusProp,
    disabled,
  });
  const { focusedPart, onPointerFocus } = nav;

  // A press on an action keeps DOM focus (and edit mode) in the input
  const keepEditing = (event: MouseEvent) => event.preventDefault();

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && onSearch) {
      event.preventDefault();
      onSearch(value);
    }
  };

  const actions = (onClear || onSearch) && (
    <>
      {onClear && (
        <span className={canClear ? styles.slot : `${styles.slot} ${styles.reserved}`}>
          <IconButton
            size={actionSize}
            label={clearLabel}
            icon={<ClearIcon />}
            focused={focusedPart === 'clear'}
            disabled={!canClear}
            onMouseMove={() => onPointerFocus('clear')}
            onMouseDown={keepEditing}
            onClick={onClear}
          />
        </span>
      )}
      {onSearch && (
        <IconButton
          size={actionSize}
          label={submitLabel}
          icon={<SubmitIcon />}
          focused={focusedPart === 'submit'}
          disabled={disabled}
          onMouseMove={() => onPointerFocus('submit')}
          onMouseDown={keepEditing}
          onClick={() => onSearch(value)}
        />
      )}
    </>
  );

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
          decoration={<SearchIcon />}
          end={actions}
          onPointerFocus={() => onPointerFocus('input')}
          frameRef={nav.ref}
        >
          <input
            enterKeyHint="search"
            autoComplete="off"
            {...props}
            {...control}
            ref={ref}
            type="search"
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            className={styles.control}
            onKeyDown={handleKeyDown}
          />
        </InputFrame>
      )}
    </Field>
  );
});
