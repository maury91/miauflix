import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

import * as styles from '../action/action.css';
import { ActionIcon, type ActionStateProps } from '../action/actionInternals';
import { guardLoading } from '../action/guardLoading';
import { type NavigableProps, useNavFocus } from '../navFocus';
import { useSurfaceContext } from '../surface';

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style'
> &
  ActionStateProps &
  NavigableProps & {
    /** Leading icon, decorative. */
    icon?: ReactNode;
    /** Stretch to the container's width. */
    fullWidth?: boolean;
    children: ReactNode;
  };

/**
 * An action with a visible label. Its look comes only from the surface it sits on and its state:
 * transparent (solid surface) or translucent (over media) at rest, white with black content when
 * focused or hovered. There are no tones or emphasis levels: a group's main action is its first.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    size = 'md',
    focused = false,
    selected = false,
    loading = false,
    fullWidth = false,
    icon,
    type = 'button',
    onClick,
    onMouseMove,
    navId,
    children,
    ...props
  },
  forwardedRef
) {
  const surface = useSurfaceContext();
  const nav = useNavFocus(navId, { focused, disabled: props.disabled, selected }, forwardedRef);
  return (
    <button
      {...props}
      ref={nav.ref}
      type={type}
      className={styles.action}
      data-button=""
      data-surface={surface}
      data-size={size}
      data-focused={nav.focused || undefined}
      data-selected={selected || undefined}
      data-full-width={fullWidth || undefined}
      aria-busy={loading || undefined}
      onClick={guardLoading(loading, onClick)}
      onMouseMove={event => {
        nav.onPointerFocus();
        onMouseMove?.(event);
      }}
    >
      <ActionIcon icon={icon} loading={loading} />
      <span className={styles.label}>{children}</span>
    </button>
  );
});
