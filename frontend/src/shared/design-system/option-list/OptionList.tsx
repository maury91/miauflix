import { type ReactNode, useEffect, useId, useRef } from 'react';

import * as styles from './optionList.css';
import { flattenOptions, isGroup, type SelectItems, type SelectOption } from './selectItems';

import CheckIcon from '~icons/mdi/check';

export interface OptionListProps<Value extends string = string> {
  items: SelectItems<Value>;
  /** The chosen value: shown with a check. */
  value: Value | null;
  /** The option holding virtual focus inside the list, mirrored as `aria-activedescendant`. */
  activeValue: Value | null;
  /** A press (or Confirm, through the owner) on an enabled option. */
  onSelect: (value: Value) => void;
  /** The pointer moved onto an enabled option, so the owner can make it active. */
  onPointerActivate?: (value: Value) => void;
  /** Accessible name: the id of a visible label… */
  labelledBy?: string;
  /** …or a name when there is none. */
  label?: string;
  id?: string;
}

/**
 * A list of choices: the active option is white (virtual focus), the chosen one has a check.
 * Disabled options stay visible and are skipped. Movement is the owner's (Select, a player popover):
 * Up/Down move the active option and clamp at the ends; Confirm selects it. The active option is
 * scrolled into view.
 */
export function OptionList<Value extends string = string>({
  items,
  value,
  activeValue,
  onSelect,
  onPointerActivate,
  labelledBy,
  label,
  id,
}: OptionListProps<Value>) {
  const generatedId = useId();
  const listId = id ?? generatedId;
  // Ids by position: values may hold characters an IDREF cannot
  const values = flattenOptions(items).map(option => option.value);
  const optionId = (optionValue: Value | null) => {
    const index = optionValue === null ? -1 : values.indexOf(optionValue);
    return index === -1 ? undefined : `${listId}-option-${index}`;
  };
  const activeId = optionId(activeValue);

  // Reveal the active option by scrolling the list only (scrollIntoView would scroll the page too)
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const option = activeId ? document.getElementById(activeId) : null;
    if (!list || !option) return;
    const top = option.offsetTop - list.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
    // Items too: a longer label above the active option can push it out of view
  }, [activeId, items]);

  const renderOption = (option: SelectOption<Value>): ReactNode => (
    <div
      key={option.value}
      id={optionId(option.value)}
      role="option"
      className={styles.option}
      aria-selected={option.value === value}
      aria-disabled={option.disabled || undefined}
      data-active={(option.value === activeValue && !option.disabled) || undefined}
      onMouseMove={() => {
        if (!option.disabled && option.value !== activeValue) onPointerActivate?.(option.value);
      }}
      onClick={() => {
        if (!option.disabled) onSelect(option.value);
      }}
    >
      <span className={styles.check} aria-hidden="true">
        <CheckIcon />
      </span>
      <span className={styles.label}>{option.label}</span>
    </div>
  );

  return (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-activedescendant={activeId}
      className={styles.listbox}
    >
      {items.map((item, index) => {
        if (!isGroup(item)) return renderOption(item);
        const groupId = `${listId}-group-${index}`;
        return (
          <div key={groupId} role="group" aria-labelledby={groupId}>
            <div id={groupId} className={styles.groupLabel}>
              {item.label}
            </div>
            {item.options.map(renderOption)}
          </div>
        );
      })}
    </div>
  );
}
