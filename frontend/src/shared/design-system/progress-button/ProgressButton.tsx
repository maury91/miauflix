import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import {
  type AnimationEvent,
  type ButtonHTMLAttributes,
  type CSSProperties,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import * as actionStyles from '../action/action.css';
import { ActionIcon } from '../action/actionInternals';
import { useSurfaceContext } from '../surface';
import * as styles from './progressButton.css';

export type ProgressButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style' | 'children' | 'onClick' | 'type'
> & {
  children: ReactNode;
  /** Leading icon, decorative. */
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  /**
   * Virtual focus, owned by the navigation layer. The feature focuses the button when it appears;
   * when focus moves to another element, the countdown ends for good.
   */
  focused?: boolean;
  /** How long the countdown takes from empty to full, in milliseconds. */
  duration: number;
  /** Hold the countdown where it is (for example while the video is paused). */
  paused?: boolean;
  /** Where the countdown starts, from 0 to 1 (a prompt shown partway through). */
  initialProgress?: number;
  /**
   * The action. Runs when the countdown fills, or at once on Confirm or click (the navigation layer
   * activates the focused element through a click). After an arrow key or a focus move ends the
   * countdown, it runs only on Confirm or click, like any Button. It runs at most once.
   */
  onAction: () => void;
};

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

/**
 * A Button for an automatic action (docs/plans/style-guide.md, "Progress button"). It fills from
 * the rest look to the focused look and runs its action when full. The feature focuses it when it
 * appears. Any arrow key, virtual focus moving away, or `disabled`, ends the countdown for good; a
 * new countdown needs a new ProgressButton (remount it with a `key`).
 */
export const ProgressButton = forwardRef<HTMLButtonElement, ProgressButtonProps>(
  function ProgressButton(
    {
      children,
      icon,
      size = 'md',
      fullWidth = false,
      focused = false,
      duration,
      paused = false,
      initialProgress = 0,
      onAction,
      disabled = false,
      ...props
    },
    ref
  ) {
    const surface = useSurfaceContext();
    // A disabled button never counts down
    const [counting, setCounting] = useState(!disabled);
    // The animation's end and a key press can arrive in the same frame: read the latest state
    const countingRef = useRef(!disabled);

    const endCountdown = useCallback(() => {
      if (!countingRef.current) return false;
      countingRef.current = false;
      setCounting(false);
      return true;
    }, []);

    // Captured on the window, so the countdown ends whoever handles the arrow
    useEffect(() => {
      if (!counting) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const keyAction = getKeyboardAction(event);
        if (keyAction && DIRECTIONS.has(keyAction)) endCountdown();
      };
      window.addEventListener('keydown', onKeyDown, true);
      return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [counting, endCountdown]);

    // Disabling ends the countdown for good, like an arrow key
    useEffect(() => {
      if (disabled) endCountdown();
    }, [disabled, endCountdown]);

    // The action runs at most once, however it is triggered
    const ranRef = useRef(false);
    const runAction = () => {
      if (ranRef.current) return;
      ranRef.current = true;
      onAction();
    };

    const handleClick = () => {
      endCountdown();
      runAction();
    };

    // Focus is virtual: moving it to another element ends the countdown, like an arrow key
    const wasFocused = useRef(focused);
    useEffect(() => {
      if (wasFocused.current && !focused) endCountdown();
      wasFocused.current = focused;
    }, [focused, endCountdown]);

    const handleAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
      // Only the clipping layer's own animation: the copy inside ends at the same time
      if (event.target !== event.currentTarget) return;
      if (endCountdown() && !disabled) runAction();
    };

    const clamped = Math.min(1, Math.max(0, initialProgress));
    const timing: CSSProperties = {
      animationDuration: `${duration}ms`,
      animationDelay: `${-clamped * duration}ms`,
    };

    return (
      <button
        {...props}
        ref={ref}
        type="button"
        className={`${actionStyles.action} ${styles.progressRoot}`}
        data-surface={surface}
        data-size={size}
        data-focused={focused || undefined}
        data-full-width={fullWidth || undefined}
        data-progress={counting || undefined}
        data-paused={(counting && paused) || undefined}
        disabled={disabled}
        onClick={handleClick}
      >
        <ActionIcon icon={icon} loading={false} />
        <span className={actionStyles.label}>{children}</span>
        {counting && (
          <span
            className={styles.clip}
            style={timing}
            onAnimationEnd={handleAnimationEnd}
            aria-hidden="true"
          >
            <span className={styles.focusedCopy} style={timing}>
              <ActionIcon icon={icon} loading={false} />
              <span className={actionStyles.label}>{children}</span>
            </span>
          </span>
        )}
      </button>
    );
  }
);
