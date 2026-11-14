import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useId } from 'react';

import * as styles from '../action/action.css';
import { ActionIcon, type ActionStateProps } from '../action/actionInternals';
import { guardLoading } from '../action/guardLoading';
import { useSurfaceContext } from '../surface';
import { Tooltip, type TooltipProps } from '../tooltip/Tooltip';

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style' | 'children' | 'aria-label' | 'aria-pressed'
> &
  ActionStateProps & {
    /** The accessible action name. Required: the button has no visible text. */
    label: string;
    /** Decorative icon. For a toggle, swap outline (off) and filled (on) icons with `pressed`. */
    icon: ReactNode;
    /**
     * Makes it a toggle (`aria-pressed`). On solid surfaces "on" also shows the selected fill; over
     * media the icon must carry the state.
     */
    pressed?: boolean;
    /**
     * A short description shown above the button while it is focused (style guide 8.3 A). It is
     * bound as the accessible description only when it adds to `label`. Inside an IconButtonGroup
     * the group's shared description is used instead.
     */
    tooltip?: string;
    tooltipPlacement?: TooltipProps['placement'];
    tooltipAlign?: TooltipProps['align'];
  };

/** A Button without a visible label: a circle, the control height across. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    pressed,
    tooltip,
    tooltipPlacement,
    tooltipAlign,
    size = 'md',
    focused = false,
    selected = false,
    loading = false,
    type = 'button',
    onClick,
    ...props
  },
  ref
) {
  const surface = useSurfaceContext();
  const tooltipId = useId();
  const describes = tooltip !== undefined && tooltip !== label;
  const button = (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-describedby={describes ? tooltipId : props['aria-describedby']}
      aria-busy={loading || undefined}
      className={styles.action}
      data-surface={surface}
      data-size={size}
      data-focused={focused || undefined}
      data-shape="circle"
      data-selected={selected || pressed || undefined}
      onClick={guardLoading(loading, onClick)}
    >
      <ActionIcon icon={icon} loading={loading} />
    </button>
  );
  if (tooltip === undefined) return button;
  return (
    <Tooltip
      content={tooltip}
      open={focused}
      placement={tooltipPlacement}
      align={tooltipAlign}
      id={tooltipId}
    >
      {button}
    </Tooltip>
  );
});
