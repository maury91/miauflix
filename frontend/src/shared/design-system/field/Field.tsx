import { type ReactNode, useId } from 'react';

import { joinIds } from '../ids';
import { ErrorMessage } from './ErrorMessage';
import * as styles from './field.css';

/** What a field's control needs to be associated with its label and supporting text. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/** The anatomy every field shares. All text comes from the feature (it is translated there). */
export interface FieldAnatomyProps {
  /** Always visible, and the control's accessible name. A placeholder never replaces it. */
  label: string;
  /** Short text next to the label, such as a translated "Optional". */
  indicator?: string;
  /** Help below the control. Not a focus target. */
  description?: ReactNode;
  /**
   * Validation message: marks the control invalid and explains how to recover. Shown with an icon
   * in the danger color, never by color alone.
   */
  error?: ReactNode;
  /** The control's id. Generated when not given. */
  id?: string;
  /** Further descriptions from the caller, read before the description and the error. */
  'aria-describedby'?: string;
}

export interface FieldProps extends FieldAnatomyProps {
  /** Renders the control, spreading the given props on the labelled element. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label, indicator, description and error around one control, with the accessibility wiring:
 * the label names the control, the description and error describe it, and an error marks it
 * invalid. TextField, PasswordField and the other fields are built on it; use it directly only for
 * a control the library doesn't have yet.
 */
export function Field({
  label,
  indicator,
  description,
  error,
  id,
  'aria-describedby': callerDescribedBy,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = joinIds(callerDescribedBy, descriptionId, errorId);

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label id={`${controlId}-label`} className={styles.label} htmlFor={controlId}>
          {label}
        </label>
        {indicator && <span className={styles.indicator}>{indicator}</span>}
      </div>
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
      {error && errorId && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </div>
  );
}
