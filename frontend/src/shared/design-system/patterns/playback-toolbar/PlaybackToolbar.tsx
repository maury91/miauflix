import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { ReactNode } from 'react';

import { ProgressSpinner } from '../../progress/Progress';
import { SurfaceContextProvider } from '../../surface';
import { Heading, Text } from '../../text/Text';
import * as styles from './playback.css';

export interface PlaybackToolbarProps {
  /** The controls' name for assistive technology ("Playback controls"). */
  label: string;
  /** What is playing, one line. */
  title?: string;
  /** The episode or a second line ("S2 · E4 The long night"). */
  subtitle?: string;
  /** Buffering: a spinner next to the title, named by this label ("Loading"). */
  busyLabel?: string;
  /** A SeekControl. */
  seek: ReactNode;
  /**
   * The main controls at the start (an IconButtonGroup: back 10 s, play/pause, forward 10 s), with
   * their shared description.
   */
  start?: ReactNode;
  /** Secondary controls at the end: audio and subtitle Popovers with OptionLists, full screen. */
  end?: ReactNode;
  /**
   * Hidden controls fade out and take no pointer. When to hide them, and that the first key after
   * reveals them without moving, is the player's call.
   */
  hidden?: boolean;
  /** The toolbar's navigation group (vertical: seek bar, then the controls row). */
  navId?: string;
}

/**
 * The player's controls over the video, on `overMedia`: title, seek bar, then the main controls at
 * the start and the secondary ones at the end. Composition only: the player adapter owns playback,
 * visibility timing and what each control does.
 */
export function PlaybackToolbar({
  label,
  title,
  subtitle,
  busyLabel,
  seek,
  start,
  end,
  hidden = false,
  navId,
}: PlaybackToolbarProps) {
  return (
    <SurfaceContextProvider value="overMedia">
      <div
        className={styles.toolbar}
        role="group"
        aria-label={label}
        aria-hidden={hidden || undefined}
        data-hidden={hidden || undefined}
      >
        {(title || busyLabel) && (
          <div className={styles.heading}>
            <div className={styles.titles}>
              {title && (
                <Heading level={2} variant="heading" maxLines={1}>
                  {title}
                </Heading>
              )}
              {subtitle && (
                <Text variant="caption" tone="secondary" maxLines={1}>
                  {subtitle}
                </Text>
              )}
            </div>
            {busyLabel && (
              <span className={styles.busy}>
                <ProgressSpinner label={busyLabel} size="md" />
              </span>
            )}
          </div>
        )}
        <FocusGroup id={navId} layout="vertical">
          {seek}
          {(start || end) && (
            <FocusGroup layout="horizontal">
              <div className={styles.controls}>
                <div>{start}</div>
                {end && <div className={styles.controlsEnd}>{end}</div>}
              </div>
            </FocusGroup>
          )}
        </FocusGroup>
      </div>
    </SurfaceContextProvider>
  );
}
