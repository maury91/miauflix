import { type ReactNode, useId } from 'react';

import { Switch } from '../choice/Switch';
import * as styles from './list.css';
import { useListItemRole } from './listContext';

/** How the control is associated with the row's title and description. */
export interface SettingControlProps {
  /** The control's own id, so its name reads "<title> <own text>" (e.g. "Preferred quality Change"). */
  id: string;
  'aria-labelledby': string;
  'aria-describedby'?: string;
}

export interface SettingToggle {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Virtual focus on the switch (outline around the row's content). */
  focused?: boolean;
  onPointerFocus?: () => void;
  /** See NavigableProps: registers the switch with the navigation layer. */
  navId?: string;
}

interface SettingRowBaseProps {
  /** Names the setting, not the action ("Episode syncing", not "Turn on"). */
  title: string;
  /** What the setting does or its consequence. Not a focus target. */
  description?: ReactNode;
}

export type SettingRowProps = SettingRowBaseProps &
  (
    | {
        /** A boolean setting that applies at once: the row is a Switch named by the title. */
        toggle: SettingToggle;
        value?: undefined;
        control?: undefined;
      }
    | {
        toggle?: undefined;
        /** The current value as text, shown before the control (for example "1080p"). */
        value?: ReactNode;
        /**
         * The control at the end: a Button ("Change"), an IconButton, a Select trigger. Spread the
         * given props on it so the title names it and the description describes it.
         */
        control?: (props: SettingControlProps) => ReactNode;
      }
  );

/**
 * A setting: title and description at the start, the value and control at the end, wrapping below
 * on narrow screens. A boolean setting is a Switch filling the row, so there is no second switch
 * design. The row itself is not focusable; its control is.
 */
export function SettingRow({ title, description, toggle, value, control }: SettingRowProps) {
  const role = useListItemRole();
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  const controlId = `${id}-control`;

  if (toggle) {
    return (
      <div role={role} className={styles.row}>
        <div className={styles.settingToggle}>
          <Switch
            label={title}
            description={description}
            checked={toggle.checked}
            onCheckedChange={toggle.onCheckedChange}
            disabled={toggle.disabled}
            focused={toggle.focused}
            onPointerFocus={toggle.onPointerFocus}
            navId={toggle.navId}
          />
        </div>
      </div>
    );
  }

  return (
    <div role={role} className={styles.row}>
      <div className={styles.setting}>
        <div className={styles.settingText}>
          <span id={titleId} className={styles.title}>
            {title}
          </span>
          {description && (
            <span id={descriptionId} className={styles.description}>
              {description}
            </span>
          )}
        </div>
        {(value !== undefined || control) && (
          <div className={styles.settingControl}>
            {value !== undefined && <span className={styles.settingValue}>{value}</span>}
            {control?.({
              id: controlId,
              'aria-labelledby': `${titleId} ${controlId}`,
              'aria-describedby': descriptionId,
            })}
          </div>
        )}
      </div>
    </div>
  );
}
