import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useId } from 'react';

import { visuallyHidden } from '../a11y.css';
import { joinIds } from '../ids';
import { type NavigableProps, useNavFocus } from '../navFocus';
import { ProgressBar } from '../progress/Progress';
import * as styles from './collectionTile.css';

export type CollectionTileProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style' | 'children'
> & {
  /** The tile's name: one line with ellipsis, always read in full. From the feature (i18n). */
  label: string;
  /** One short line under the label: year, episode, "Kids profile". */
  supportingText?: string;
  /**
   * Covers the frame: an Artwork with `ratio="fill"`, or a decorative Avatar with `size="fill"`.
   * Absent, the frame keeps its geometry.
   */
  visual?: ReactNode;
  /** 16:9, 2:3 or 1:1. */
  ratio?: 'landscape' | 'portrait' | 'square';
  /** Text under the frame, or over the artwork on the tile scrim. */
  labelPlacement?: 'below' | 'overlay';
  /** A Badge at the frame's top start corner. Its text joins the description. */
  badge?: ReactNode;
  /** Watched share, 0 to 1: a decorative hairline at the frame's bottom. */
  progress?: number;
  /** The share in words ("40% watched"), read as part of the description. */
  progressText?: string;
  /** Virtual focus (outline and scale), from the navigation layer. */
  focused?: boolean;
  /** Called when the pointer moves onto the tile. */
  onPointerFocus?: () => void;
} & NavigableProps;

/**
 * One primary action led by artwork: media tiles, profile choices. Generic: it knows nothing about
 * media DTOs. Quick actions are siblings in the collection's recipe, never inside the tile.
 */
export const CollectionTile = forwardRef<HTMLButtonElement, CollectionTileProps>(
  function CollectionTile(
    {
      label,
      supportingText,
      visual,
      ratio = 'landscape',
      labelPlacement = 'below',
      badge,
      progress,
      progressText,
      focused = false,
      onPointerFocus,
      type = 'button',
      onMouseMove,
      navId,
      'aria-describedby': callerDescribedBy,
      ...props
    },
    forwardedRef
  ) {
    const id = useId();
    const nav = useNavFocus(navId, { focused, disabled: props.disabled }, forwardedRef);
    const labelId = `${id}-label`;
    const describedBy = joinIds(
      callerDescribedBy,
      supportingText && `${id}-supporting`,
      Boolean(badge) && `${id}-badge`,
      progressText && `${id}-progress`
    );
    const hasProgress = progress !== undefined;

    return (
      <button
        {...props}
        ref={nav.ref}
        type={type}
        className={styles.tile}
        data-focused={nav.focused || undefined}
        data-ratio={ratio}
        data-label={labelPlacement}
        data-progress={hasProgress || undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        onMouseMove={event => {
          nav.onPointerFocus();
          onPointerFocus?.();
          onMouseMove?.(event);
        }}
      >
        <span className={styles.frame}>
          <span className={styles.visual}>
            {visual}
            {labelPlacement === 'overlay' && (
              <span className={styles.scrimLayer} aria-hidden="true" />
            )}
          </span>
          {badge && (
            <span id={`${id}-badge`} className={styles.badge}>
              {badge}
            </span>
          )}
          {hasProgress && (
            <span className={styles.progress}>
              <ProgressBar decorative value={progress} />
            </span>
          )}
          {labelPlacement === 'overlay' && (
            <TileText id={id} label={label} supportingText={supportingText} />
          )}
        </span>
        {labelPlacement === 'below' && (
          <TileText id={id} label={label} supportingText={supportingText} />
        )}
        {progressText && (
          <span id={`${id}-progress`} className={visuallyHidden}>
            {progressText}
          </span>
        )}
      </button>
    );
  }
);

function TileText({
  id,
  label,
  supportingText,
}: {
  id: string;
  label: string;
  supportingText?: string;
}): ReactNode {
  return (
    <span className={styles.text}>
      <span id={`${id}-label`} className={styles.label}>
        {label}
      </span>
      {supportingText && (
        <span id={`${id}-supporting`} className={styles.supporting}>
          {supportingText}
        </span>
      )}
    </span>
  );
}
