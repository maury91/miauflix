import { forwardRef, type ReactNode } from 'react';

import { visuallyHidden } from '../a11y.css';
import { ProgressBar } from '../progress/Progress';
import type { CollectionTileProps } from './CollectionTile';
import * as styles from './collectionTile.css';
import { useCollectionTile } from './useCollectionTile';

/** CollectionTile as DOM: the frame, visual, scrim, badge, progress and text as elements. */
export const CollectionTileDom = forwardRef<HTMLButtonElement, CollectionTileProps>(
  function CollectionTileDom(props, forwardedRef) {
    const {
      label,
      supportingText,
      visual,
      ratio = 'landscape',
      labelPlacement = 'below',
      labelHidden = false,
      badge,
      progress,
      progressText,
    } = props;
    const { id, buttonProps } = useCollectionTile(props, forwardedRef);
    const hasProgress = progress !== undefined;
    return (
      <button
        {...buttonProps}
        className={styles.tile}
        data-ratio={ratio}
        data-label={labelPlacement}
        data-progress={hasProgress || undefined}
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
            <TileText
              id={id}
              label={label}
              labelHidden={labelHidden}
              supportingText={supportingText}
            />
          )}
        </span>
        {labelPlacement === 'below' && (
          <TileText
            id={id}
            label={label}
            labelHidden={labelHidden}
            supportingText={supportingText}
          />
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
  labelHidden,
  supportingText,
}: {
  id: string;
  label: string;
  labelHidden: boolean;
  supportingText?: string;
}): ReactNode {
  return (
    <span className={styles.text}>
      <span id={`${id}-label`} className={labelHidden ? visuallyHidden : styles.label}>
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
