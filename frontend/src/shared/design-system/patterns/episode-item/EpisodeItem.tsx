import type { ReactNode } from 'react';

import { visuallyHidden } from '../../a11y.css';
import { Artwork } from '../../artwork/Artwork';
import { ListItem } from '../../list/ListItem';
import { ProgressBar } from '../../progress/Progress';
import * as styles from './episodeItem.css';

import EpisodeIcon from '~icons/mdi/movie-open-outline';

interface EpisodeContent {
  /** Number and name, formatted by the feature ("4. The long night"). Names the row. */
  title: string;
  /** The synopsis. Wraps; never truncated. */
  description?: string;
  /** The episode still (16:9). Missing or failing, an icon keeps the box. */
  still?: string | null;
  /** Short facts at the row's end: the runtime, an air date. */
  metadata?: string;
  /** A Badge before the facts ("New", "Unaired"). */
  badge?: ReactNode;
  /** Watched share, 0 to 1: a decorative hairline along the still's bottom. */
  progress?: number;
  /** The share in words ("12 min left"), read with the description. */
  progressText?: string;
  /** The episode playing or next up: a quiet fill and `aria-current`. */
  selected?: boolean;
  /**
   * Trailing IconButtons (mark watched, notify), siblings of the row's primary part with their own
   * `navId`s.
   */
  trailing?: ReactNode;
  /** Virtual focus on the row (outline), from the navigation layer. */
  focused?: boolean;
  onPointerFocus?: () => void;
  /** See ListItem: registers the row (and makes it a group with its trailing actions). */
  navId?: string;
}

export type EpisodeItemProps = EpisodeContent &
  (
    | {
        /** Plays the episode. */
        onClick: () => void;
        /** Not playable (unaired, no source); trailing actions still work. */
        disabled?: boolean;
      }
    | { onClick?: undefined; disabled?: undefined }
  );

/**
 * An episode in a season list: the still, title, synopsis and facts, plus trailing actions. A
 * ListItem underneath, so it moves, focuses and announces like every other row; the details
 * feature adapts its episode data into these props.
 */
export function EpisodeItem({
  title,
  description,
  still,
  metadata,
  badge,
  progress,
  progressText,
  selected,
  trailing,
  focused,
  onPointerFocus,
  navId,
  onClick,
  disabled,
}: EpisodeItemProps) {
  const leading = (
    <span className={styles.still}>
      <Artwork src={still} ratio="landscape" fallback={<EpisodeIcon />} />
      {progress !== undefined && (
        <span className={styles.progress}>
          <ProgressBar decorative value={progress} />
        </span>
      )}
    </span>
  );
  const facts =
    badge || metadata ? (
      <span className={styles.metadata}>
        {badge && <span className={styles.metadataBadge}>{badge}</span>}
        {metadata}
      </span>
    ) : undefined;
  const about =
    description || progressText ? (
      <>
        {description}
        {description && progressText && ' '}
        {progressText && <span className={visuallyHidden}>{progressText}</span>}
      </>
    ) : undefined;
  const content = {
    title,
    description: about,
    leading,
    metadata: facts,
    trailing,
    selected,
    focused,
    onPointerFocus,
    navId,
  };
  return onClick ? (
    <ListItem {...content} onClick={() => onClick()} disabled={disabled} />
  ) : (
    <ListItem {...content} />
  );
}
