import { IS_TV } from '@shared/config/constants';
import type { ReactNode } from 'react';

import { visuallyHidden } from '../a11y.css';
import { useSurfaceContext } from '../surface';
import * as styles from './keyHint.css';

import ArrowAllIcon from '~icons/mdi/arrow-all';
import ArrowDownIcon from '~icons/mdi/arrow-down';
import ArrowLeftIcon from '~icons/mdi/arrow-left';
import ArrowLeftRightIcon from '~icons/mdi/arrow-left-right';
import ArrowRightIcon from '~icons/mdi/arrow-right';
import BackIcon from '~icons/mdi/arrow-u-left-top';
import ArrowUpIcon from '~icons/mdi/arrow-up';
import ArrowUpDownIcon from '~icons/mdi/arrow-up-down';
import RemoteConfirmIcon from '~icons/mdi/circle-outline';
import EscapeIcon from '~icons/mdi/keyboard-esc';
import ReturnIcon from '~icons/mdi/keyboard-return';
import PlayPauseIcon from '~icons/mdi/play-pause';

/** What a key does, not what it is called: the glyph follows the platform. */
export type HintKey =
  | 'confirm'
  | 'back'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'upDown'
  | 'leftRight'
  | 'arrows'
  | 'playPause'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue';

const remoteColors = new Set<HintKey>(['red', 'green', 'yellow', 'blue']);

/** Icons only, so no key name needs translating; TV shows the remote's keys. */
function glyph(key: HintKey, remote: boolean): ReactNode {
  switch (key) {
    case 'confirm':
      return remote ? <RemoteConfirmIcon /> : <ReturnIcon />;
    case 'back':
      return remote ? <BackIcon /> : <EscapeIcon />;
    case 'up':
      return <ArrowUpIcon />;
    case 'down':
      return <ArrowDownIcon />;
    case 'left':
      return <ArrowLeftIcon />;
    case 'right':
      return <ArrowRightIcon />;
    case 'upDown':
      return <ArrowUpDownIcon />;
    case 'leftRight':
      return <ArrowLeftRightIcon />;
    case 'arrows':
      return <ArrowAllIcon />;
    case 'playPause':
      return <PlayPauseIcon />;
    default:
      return <span className={styles.swatch} data-color={key} />;
  }
}

export interface KeyHintProps {
  /** The key, or keys pressed for the same thing (e.g. `['left', 'right']`). */
  keys: HintKey | readonly HintKey[];
  /** What it does: "Select", "Back", "Seek". Comes from the feature (i18n). */
  label: string;
  /**
   * The key's name for assistive technology ("Enter", "Red button"), from the feature (i18n).
   * Without it, only the label is read.
   */
  keyLabel?: string;
  /** Remote glyphs (TV) or keyboard glyphs (web). Defaults by platform. */
  device?: 'remote' | 'keyboard';
}

/**
 * A key cap and what it does, for a keyboard or remote legend (group several with Inline). Never
 * focusable, never the only way to learn an action: legends are a convenience. The glyphs are
 * icons, so nothing in the cap needs translating; the remote's colour buttons show their colour.
 */
export function KeyHint({
  keys,
  label,
  keyLabel,
  device = IS_TV ? 'remote' : 'keyboard',
}: KeyHintProps) {
  const surface = useSurfaceContext();
  const list: readonly HintKey[] = typeof keys === 'string' ? [keys] : keys;
  return (
    <span className={styles.hint} data-surface={surface}>
      {list.map(key => (
        <span
          key={key}
          className={styles.cap}
          data-color={remoteColors.has(key) ? key : undefined}
          aria-hidden="true"
        >
          {glyph(key, device === 'remote')}
        </span>
      ))}
      {keyLabel && <span className={visuallyHidden}>{`${keyLabel} `}</span>}
      <span className={styles.label}>{label}</span>
    </span>
  );
}
