import type { ReactNode } from 'react';

import { ErrorMessage } from '../field/ErrorMessage';
import * as styles from './choice.css';

/** Text and state every choice shares. All text comes from the feature (it is translated there). */
export interface ChoiceProps {
  /** Always visible; names the control. */
  label: string;
  /** Help below the label. Not a focus target. */
  description?: ReactNode;
  /**
   * Virtual focus, owned by the navigation layer (the pointer focuses what it moves onto). Shown as
   * the white outline around the whole choice; DOM focus never changes the look.
   */
  focused?: boolean;
  /** Called when the pointer moves onto the choice, so the navigation layer can focus it. */
  onPointerFocus?: () => void;
}

interface ChoiceFrameProps extends Omit<ChoiceProps, 'description'> {
  description?: ReactNode;
  /** Id of the label text: the control's `aria-labelledby`, so the description is not in its name. */
  labelId: string;
  descriptionId?: string;
  checked: boolean;
  mixed?: boolean;
  invalid?: boolean;
  disabled: boolean;
  /** Puts the indicator after the text, at the far end (switches). */
  indicatorAtEnd?: boolean;
  /** The visual indicator with the native control inside. */
  indicator: ReactNode;
}

/**
 * The shared shell of a choice: a label wrapping the indicator (with its native control) and the
 * text, so a press anywhere on it toggles natively. The outline is drawn around all of it.
 */
export function ChoiceFrame({
  label,
  description,
  descriptionId,
  labelId,
  focused = false,
  onPointerFocus,
  checked,
  mixed = false,
  invalid = false,
  disabled,
  indicatorAtEnd = false,
  indicator,
}: ChoiceFrameProps) {
  return (
    <label
      className={styles.choice}
      data-focused={focused || undefined}
      data-checked={(checked && !mixed) || undefined}
      data-mixed={mixed || undefined}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-end={indicatorAtEnd || undefined}
      onMouseMove={onPointerFocus}
    >
      <span className={styles.indicatorSlot}>{indicator}</span>
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** A choice's error below it. */
export function ChoiceError({ id, children }: { id?: string; children: ReactNode }) {
  if (!id || !children) return null;
  return <ErrorMessage id={id}>{children}</ErrorMessage>;
}
