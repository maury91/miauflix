import {
  type SeekThumbnailLoader,
  snapToGrid,
  THUMBNAIL_STEP_SECONDS,
} from '@features/player/lib/seek-thumbnails';
import { useEffect, useState } from 'react';

import * as styles from './seekThumbnails.css';

/**
 * The frame for `seconds` once loaded (a frame already at hand shows at once). It waits `delayMs`
 * first, so a moment passed over quickly is never asked for; leaving it cancels its request.
 * `keepPrevious` shows the last frame until the next one arrives (a preview following the pointer).
 */
function useSeekThumbnail(
  loader: SeekThumbnailLoader,
  seconds: number,
  delayMs: number,
  keepPrevious = false
): string | undefined {
  const [url, setUrl] = useState(() => loader.cached(seconds));
  useEffect(() => {
    const known = loader.cached(seconds);
    if (known || !keepPrevious) setUrl(known);
    if (known) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loader.load(seconds, controller.signal).then(setUrl, () => {
        // No frame there (past the end, still downloading): the tile stays empty
      });
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loader, seconds, delayMs, keepPrevious]);
  return url;
}

/** Tiles on each side of the selected one: two, the outer ones half out of the screen. */
const SIDE_TILES = 2;

function StripTile({
  loader,
  seconds,
  offset,
}: {
  loader: SeekThumbnailLoader;
  seconds: number;
  /** Tiles from the selected one, negative before it. */
  offset: number;
}) {
  // The selected frame first, its neighbours a moment later
  const url = useSeekThumbnail(loader, seconds, offset === 0 ? 0 : 150);
  // Left edges as shares of the strip, the selected tile centred, in tile widths for translate
  const left = 50 - styles.TILE_SHARE / 2 + offset * (styles.TILE_SHARE + styles.TILE_GAP_SHARE);
  return (
    <div
      className={styles.tile}
      data-selected={offset === 0 || undefined}
      style={{ transform: `translateX(${(left / styles.TILE_SHARE) * 100}%)` }}
    >
      {url && <img className={styles.image} src={url} alt="" />}
    </div>
  );
}

/**
 * The TV's seek preview: five frames 10 seconds apart above the seek bar, the selected moment
 * centred and outlined, the outer two cut by the screen's edges. Moments outside the video have
 * no tile. Decorative: the seek bar announces the selected time.
 */
export function SeekThumbnailStrip({
  loader,
  selected,
  duration,
}: {
  loader: SeekThumbnailLoader;
  /** The selected moment, on the 10-second grid. */
  selected: number;
  duration: number;
}) {
  const tiles: number[] = [];
  for (let offset = -SIDE_TILES; offset <= SIDE_TILES; offset++) {
    const seconds = selected + offset * THUMBNAIL_STEP_SECONDS;
    if (seconds >= 0 && seconds < duration) tiles.push(offset);
  }
  return (
    <div className={styles.strip} aria-hidden="true" data-testid="seek-thumbnail-strip">
      {tiles.map(offset => {
        const seconds = selected + offset * THUMBNAIL_STEP_SECONDS;
        // Keyed by moment: a step slides the tiles that stay instead of reloading them
        return <StripTile key={seconds} loader={loader} seconds={seconds} offset={offset} />;
      })}
    </div>
  );
}

/** The web's preview over the hovered point of the seek bar: the frame there and its time. */
export function SeekThumbnailBubble({
  loader,
  seconds,
  time,
}: {
  loader: SeekThumbnailLoader;
  seconds: number;
  /** The hovered time, formatted ("1:04:10"). */
  time: string;
}) {
  const url = useSeekThumbnail(loader, snapToGrid(seconds), 120, true);
  return (
    <div className={styles.bubble}>
      <div className={styles.bubbleFrame}>
        {url && <img className={styles.bubbleImage} src={url} alt="" />}
      </div>
      <span className={styles.bubbleTime}>{time}</span>
    </div>
  );
}
