import { FocusGroup } from '@shared/navigation/NavigationProvider';
import { type ReactNode, useId } from 'react';

import { visuallyHidden } from '../a11y.css';
import { useNavFocus } from '../navFocus';
import * as styles from './choiceTile.css';

export interface ChoiceTileOption<Value extends string = string> {
  value: Value;
  /** The option's name, from the feature (i18n). Shown under a tile; a swatch's accessible name. */
  label: string;
  /** Tiles: a decorative picture filling the tile's width (the feature sets its height). */
  visual?: ReactNode;
  /** Swatches: the colour filling the circle. */
  color?: string;
  disabled?: boolean;
}

export interface ChoiceTileGroupProps<Value extends string = string> {
  /** The question the choices answer; the group's accessible name. */
  label: string;
  /** Keep the label for assistive technology only (a tab already names the group). */
  labelHidden?: boolean;
  options: readonly ChoiceTileOption<Value>[];
  /** The chosen value. */
  value: Value;
  onChange: (value: Value) => void;
  /** `tile`: a picture with its name under it. `swatch`: a colour circle, named by its label. */
  shape?: 'tile' | 'swatch';
  /**
   * Registers the options as a spatial group with the navigation layer (each `<navId>:<value>`,
   * wrapping across lines), entered at the chosen option. See NavigableProps.
   */
  navId?: string;
}

/**
 * One choice among options shown as pictures or colours: a Plushie's shape, fabric, eyes or
 * colour. Like RadioGroup, moving focus never changes the choice; Confirm or a press selects.
 */
export function ChoiceTileGroup<Value extends string = string>({
  label,
  labelHidden = false,
  options,
  value,
  onChange,
  shape = 'tile',
  navId,
}: ChoiceTileGroupProps<Value>) {
  const labelId = `${useId()}-label`;
  return (
    <FocusGroup id={navId} layout="spatial" disabled={navId === undefined}>
      <div className={styles.group} role="radiogroup" aria-labelledby={labelId}>
        <span id={labelId} className={labelHidden ? visuallyHidden : styles.label}>
          {label}
        </span>
        <div className={styles.options}>
          {options.map(option => (
            <ChoiceTile
              key={option.value}
              option={option}
              shape={shape}
              selected={option.value === value}
              navId={navId === undefined ? undefined : `${navId}:${option.value}`}
              onSelect={() => onChange(option.value)}
            />
          ))}
        </div>
      </div>
    </FocusGroup>
  );
}

function ChoiceTile<Value extends string>({
  option,
  shape,
  selected,
  navId,
  onSelect,
}: {
  option: ChoiceTileOption<Value>;
  shape: 'tile' | 'swatch';
  selected: boolean;
  navId?: string;
  onSelect: () => void;
}) {
  const nav = useNavFocus<HTMLButtonElement>(navId, { selected, disabled: option.disabled });
  const swatch = shape === 'swatch';
  return (
    <button
      ref={nav.ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={swatch ? option.label : undefined}
      className={styles.option}
      data-shape={shape}
      data-selected={selected || undefined}
      data-focused={nav.focused || undefined}
      disabled={option.disabled}
      style={swatch && option.color ? { backgroundColor: option.color } : undefined}
      onMouseMove={nav.onPointerFocus}
      onClick={() => {
        if (!selected) onSelect();
      }}
    >
      {!swatch && (
        <>
          <span className={styles.visual} aria-hidden="true">
            {option.visual}
          </span>
          <span className={styles.optionLabel}>{option.label}</span>
        </>
      )}
    </button>
  );
}
