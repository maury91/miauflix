import { IS_TV } from '@shared/config/constants';
import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import * as actionStyles from '../action/action.css';
import { Field, type FieldAnatomyProps, type FieldControlProps } from '../field/Field';
import { OptionList } from '../option-list/OptionList';
import { flattenOptions, isGroup, type SelectItems, stepOption } from '../option-list/selectItems';
import { SurfaceContextProvider, useSurfaceContext } from '../surface';
import type { ControlSize } from '../tokens';
import * as styles from './select.css';

import ChevronIcon from '~icons/mdi/chevron-down';

interface SelectBaseProps<Value extends string> {
  items: SelectItems<Value>;
  /** The chosen value; `null` shows the placeholder. */
  value: Value | null;
  onChange: (value: Value) => void;
  /** Shown while nothing is chosen. Never a replacement for the label. */
  placeholder?: string;
  size?: ControlSize;
  fullWidth?: boolean;
  disabled?: boolean;
  /**
   * `native` uses the platform's picker (desktop and mobile web); `popup` opens an OptionList
   * driven by virtual focus (TV). Defaults by platform.
   */
  mode?: 'native' | 'popup';
  /** Where the popup opens. Use `top` for selects near the bottom of the screen. */
  placement?: 'bottom' | 'top';
  /** Virtual focus on the trigger (white fill), from the navigation layer. */
  focused?: boolean;
  /** Called when the pointer moves onto the trigger. */
  onPointerFocus?: () => void;
  /** The popup opened or closed: while open it owns the arrows, Confirm and Back. */
  onOpenChange?: (open: boolean) => void;
}

/** Labelled by its own Field anatomy… */
type LabelledProps = FieldAnatomyProps & {
  'aria-labelledby'?: undefined;
  'aria-describedby'?: undefined;
};

/** …or by a row around it, such as SettingRow's `control` props. */
type RowLabelledProps = {
  label?: undefined;
  indicator?: undefined;
  description?: undefined;
  error?: undefined;
  id: string;
  'aria-labelledby': string;
  'aria-describedby'?: string;
};

export type SelectProps<Value extends string = string> = SelectBaseProps<Value> &
  (LabelledProps | RowLabelledProps);

/**
 * One choice from a list, behind a trigger that shows the current value. One value/options
 * contract, two adapters: the platform picker on the web, a popup OptionList on TV. While the popup
 * is open it owns the keys: Up/Down move the active option (clamped), Confirm chooses it and
 * closes, Back closes without changing anything, Left/Right stay inside. A press outside closes.
 */
export function Select<Value extends string = string>(props: SelectProps<Value>) {
  const { label, indicator, description, error, id } = props;
  if (label === undefined) {
    return (
      <SelectControl
        {...props}
        control={{
          id: props.id,
          'aria-describedby': props['aria-describedby'],
        }}
        labelledBy={`${props['aria-labelledby']}`}
        invalid={false}
      />
    );
  }
  return (
    <Field label={label} indicator={indicator} description={description} error={error} id={id}>
      {control => (
        <SelectControl
          {...props}
          control={control}
          labelledBy={`${control.id}-label`}
          invalid={Boolean(error)}
        />
      )}
    </Field>
  );
}

interface SelectControlProps<Value extends string> extends SelectBaseProps<Value> {
  control: Omit<FieldControlProps, 'aria-invalid'> & { 'aria-invalid'?: true };
  /** Id(s) naming the select, without its value. */
  labelledBy: string;
  invalid: boolean;
}

function SelectControl<Value extends string>({
  items,
  value,
  onChange,
  placeholder,
  size = 'md',
  fullWidth = false,
  disabled = false,
  mode = IS_TV ? 'popup' : 'native',
  placement = 'bottom',
  focused = false,
  onPointerFocus,
  onOpenChange,
  control,
  labelledBy,
  invalid,
}: SelectControlProps<Value>) {
  const surface = useSurfaceContext();
  const options = flattenOptions(items);
  const chosen = options.find(option => option.value === value);
  const valueId = `${control.id}-value`;

  const triggerAttributes = {
    className: `${actionStyles.action} ${styles.trigger}`,
    'data-surface': surface,
    'data-size': size,
    'data-focused': focused || undefined,
    'data-full-width': fullWidth || undefined,
    'data-invalid': invalid || undefined,
  };
  const content: ReactNode = (
    <>
      <span
        id={valueId}
        // The native select announces its own value
        aria-hidden={mode === 'native' || undefined}
        className={`${actionStyles.label} ${styles.value}`}
        data-placeholder={chosen ? undefined : true}
      >
        {chosen ? chosen.label : placeholder}
      </span>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronIcon />
      </span>
    </>
  );

  if (mode === 'native') {
    return (
      <span className={styles.root} data-full-width={fullWidth || undefined}>
        <span
          {...triggerAttributes}
          data-disabled={disabled || undefined}
          onMouseMove={onPointerFocus}
        >
          {content}
          <select
            {...control}
            aria-labelledby={labelledBy}
            className={styles.nativeSelect}
            value={value ?? ''}
            disabled={disabled}
            onChange={event => onChange(event.target.value as Value)}
          >
            {value === null && (
              <option value="" disabled>
                {placeholder ?? ''}
              </option>
            )}
            {items.map((item, index) =>
              isGroup(item) ? (
                <optgroup key={`group-${index}`} label={item.label}>
                  {item.options.map(option => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={item.value} value={item.value} disabled={item.disabled}>
                  {item.label}
                </option>
              )
            )}
          </select>
        </span>
      </span>
    );
  }

  return (
    <PopupSelect
      items={items}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placement={placement}
      onPointerFocus={onPointerFocus}
      onOpenChange={onOpenChange}
      control={control}
      labelledBy={labelledBy}
      valueId={valueId}
      triggerAttributes={triggerAttributes}
      fullWidth={fullWidth}
    >
      {content}
    </PopupSelect>
  );
}

interface PopupSelectProps<Value extends string> {
  items: SelectItems<Value>;
  value: Value | null;
  onChange: (value: Value) => void;
  disabled: boolean;
  placement: 'bottom' | 'top';
  onPointerFocus?: () => void;
  onOpenChange?: (open: boolean) => void;
  control: SelectControlProps<Value>['control'];
  labelledBy: string;
  valueId: string;
  triggerAttributes: Record<string, string | boolean | undefined>;
  fullWidth: boolean;
  children: ReactNode;
}

function PopupSelect<Value extends string>({
  items,
  value,
  onChange,
  disabled,
  placement,
  onPointerFocus,
  onOpenChange,
  control,
  labelledBy,
  valueId,
  triggerAttributes,
  fullWidth,
  children,
}: PopupSelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Value | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const latest = useRef({ items, active, onChange, onOpenChange });
  latest.current = { items, active, onChange, onOpenChange };

  const setOpenState = (next: boolean) => {
    setOpen(next);
    latest.current.onOpenChange?.(next);
  };

  const openPopup = () => {
    const options = flattenOptions(items);
    const current = options.find(option => option.value === value && !option.disabled);
    setActive(current ? current.value : stepOption(options, null, 1));
    setOpenState(true);
  };

  const close = () => setOpenState(false);

  const choose = (next: Value) => {
    close();
    if (next !== value) latest.current.onChange(next);
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const listbox = document.getElementById(listId);
    const trigger = triggerRef.current;
    listbox?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      const keyAction = getKeyboardAction(event);
      if (!keyAction) return;
      const owned = ['up', 'down', 'left', 'right', 'confirm', 'back'].includes(keyAction);
      if (!owned) return;
      event.preventDefault();
      event.stopPropagation();
      if (keyAction === 'up' || keyAction === 'down') {
        const options = flattenOptions(latest.current.items);
        setActive(current => stepOption(options, current, keyAction === 'up' ? -1 : 1));
      } else if (keyAction === 'confirm') {
        if (latest.current.active !== null) chooseRef.current(latest.current.active);
      } else if (keyAction === 'back') {
        closeRef.current();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
      // DOM focus follows the closed popup back to its trigger
      // (the listbox is already gone, so focus was left on the body)
      const active = document.activeElement;
      if (!active || active === document.body || listbox?.contains(active)) {
        trigger?.focus({ preventScroll: true });
      }
    };
  }, [open, listId]);

  return (
    <span ref={rootRef} className={styles.root} data-full-width={fullWidth || undefined}>
      <button
        {...control}
        {...triggerAttributes}
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelledBy} ${valueId}`}
        disabled={disabled}
        onMouseMove={onPointerFocus}
        onClick={() => (open ? close() : openPopup())}
      >
        {children}
      </button>
      {open && (
        <SurfaceContextProvider value="solid">
          <div className={styles.popup} data-placement={placement}>
            <OptionList
              id={listId}
              items={items}
              value={value}
              activeValue={active}
              labelledBy={labelledBy}
              onSelect={choose}
              onPointerActivate={setActive}
            />
          </div>
        </SurfaceContextProvider>
      )}
    </span>
  );
}
