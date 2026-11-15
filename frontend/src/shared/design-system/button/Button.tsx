import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

import * as styles from '../action/action.css';
import { ActionIcon, type ActionStateProps } from '../action/actionInternals';
import { guardLoading } from '../action/guardLoading';
import { useSurfaceContext } from '../surface';

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style'
> &
  ActionStateProps & {
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
    children,
    ...props
  },
  ref
) {
  const surface = useSurfaceContext();
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={styles.action}
      data-surface={surface}
      data-size={size}
      data-focused={focused || undefined}
      data-selected={selected || undefined}
      data-full-width={fullWidth || undefined}
      aria-busy={loading || undefined}
      onClick={guardLoading(loading, onClick)}
    >
      <ActionIcon icon={icon} loading={loading} />
      <span className={styles.label}>{children}</span>
    </button>
  );
});
