import type { MouseEvent, ReactNode } from 'react';

import { SurfaceContextProvider } from '../surface';
import type { ControlSize } from '../tokens';
import * as styles from './field.css';

/** Field state every text-like field shares. */
export interface FieldStateProps {
  /** Control size. TV forms use `lg`; `sm` is for web only. */
  size?: ControlSize;
  /**
   * Virtual focus on the input part, owned by the navigation layer (the pointer focuses what it
   * moves onto). Shown as the white outline; DOM focus (edit mode) never changes the look.
   */
  focused?: boolean;
  /** Called when the pointer moves onto the input part, so the navigation layer can focus it. */
  onPointerFocus?: () => void;
}

interface InputFrameProps {
  size: ControlSize;
  focused: boolean;
  invalid: boolean;
  disabled: boolean;
  readOnly: boolean;
  multiline?: boolean;
  centered?: boolean;
  /** Decorative leading icon. */
  decoration?: ReactNode;
  /** Actions before the input, such as a decrement step. */
  start?: ReactNode;
  /** Actions after the input, such as reveal, clear or submit. */
  end?: ReactNode;
  onPointerFocus?: () => void;
  /** The native input or textarea. */
  children: ReactNode;
}

const isInActions = (event: MouseEvent) =>
  event.target instanceof Element && event.target.closest('[data-field-actions]') !== null;

/**
 * The shared shell of every text-like field: background, border, focus outline and the
 * start/control/end slots. Actions in the slots are IconButtons sized by `fieldActionSize`; they
 * always sit on the frame's solid fill, whatever surface the field is on.
 */
export function InputFrame({
  size,
  focused,
  invalid,
  disabled,
  readOnly,
  multiline = false,
  centered = false,
  decoration,
  start,
  end,
  onPointerFocus,
  children,
}: InputFrameProps) {
  const onMouseMove = (event: MouseEvent) => {
    // Actions focus themselves
    if (!isInActions(event)) onPointerFocus?.();
  };
  // A press on the frame's padding or icon edits the input, as a press on the input itself would
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled || isInActions(event)) return;
    const control = event.currentTarget.querySelector<HTMLElement>('input, textarea');
    if (!control || event.target === control) return;
    event.preventDefault();
    control.focus();
  };

  return (
    <div
      className={styles.frame}
      data-size={size}
      data-focused={focused || undefined}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-multiline={multiline || undefined}
      data-centered={centered || undefined}
      data-start={decoration || start ? true : undefined}
      data-end={end ? true : undefined}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
    >
      {decoration && (
        <span className={styles.decoration} aria-hidden="true">
          {decoration}
        </span>
      )}
      {start && (
        <SurfaceContextProvider value="solid">
          <span className={styles.actions} data-field-actions>
            {start}
          </span>
        </SurfaceContextProvider>
      )}
      {children}
      {end && (
        <SurfaceContextProvider value="solid">
          <span className={styles.actions} data-field-actions>
            {end}
          </span>
        </SurfaceContextProvider>
      )}
    </div>
  );
}
