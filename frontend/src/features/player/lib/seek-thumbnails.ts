import { backendUrl } from './playback-request';

/** The backend takes thumbnails on this grid, in seconds; the TV's strip steps by it. */
export const THUMBNAIL_STEP_SECONDS = 10;
/** Blob URLs of frames kept per player. */
const CACHE_ENTRIES = 80;

/** The grid moment a time shows (the backend answers with the keyframe there). */
export const snapToGrid = (seconds: number) =>
  Math.max(0, Math.floor(seconds / THUMBNAIL_STEP_SECONDS) * THUMBNAIL_STEP_SECONDS);

/** The last grid moment strictly before the end of a video of `duration` seconds. */
export const lastGridStop = (duration: number) =>
  duration > 0 ? (Math.ceil(duration / THUMBNAIL_STEP_SECONDS) - 1) * THUMBNAIL_STEP_SECONDS : 0;

/**
 * Where the strip opens from `position`: the nearest grid moment in the direction pressed, so the
 * first press moves (from 1:04, Right opens on 1:10 and Left on 1:00), within the video.
 */
export function firstStripStop(position: number, direction: 1 | -1, duration: number): number {
  const step = THUMBNAIL_STEP_SECONDS;
  const at =
    direction > 0
      ? Math.floor(position / step) * step + step
      : Math.ceil(position / step) * step - step;
  return Math.min(lastGridStop(duration), Math.max(0, at));
}

/**
 * Fetches a playback's seek thumbnails and keeps the most recent as blob URLs, so a frame seen once
 * shows again at once. A request whose view went away is aborted (the backend stops its FFmpeg).
 */
export class SeekThumbnailLoader {
  private readonly urls = new Map<number, string>();
  private readonly base: string;
  private disposed = false;

  /** `streamUrl` is the session's stream (with or without its `/audio` or remux suffix). */
  constructor(streamUrl: string) {
    this.base = backendUrl(streamUrl.replace(/\/(?:audio|remux\/index\.m3u8)$/, ''));
  }

  /** The frame already at hand for `seconds`, if any. */
  cached(seconds: number): string | undefined {
    return this.urls.get(snapToGrid(seconds));
  }

  /** The frame for `seconds` as an object URL; rejects when there is none or `signal` aborts. */
  async load(seconds: number, signal: AbortSignal): Promise<string> {
    const at = snapToGrid(seconds);
    const known = this.urls.get(at);
    if (known) return known;
    const response = await fetch(`${this.base}/thumbnail?t=${at}`, { signal });
    if (!response.ok) throw new Error(`Thumbnail unavailable (${response.status})`);
    const blob = await response.blob();
    // Disposed while the body arrived: nothing would revoke a URL made now
    if (this.disposed) throw new Error('Thumbnails were disposed');
    const url = URL.createObjectURL(blob);
    // Another view may have loaded it meanwhile
    const raced = this.urls.get(at);
    if (raced) {
      URL.revokeObjectURL(url);
      return raced;
    }
    this.urls.set(at, url);
    if (this.urls.size > CACHE_ENTRIES) {
      const [oldest, oldUrl] = this.urls.entries().next().value as [number, string];
      this.urls.delete(oldest);
      URL.revokeObjectURL(oldUrl);
    }
    return url;
  }

  /** Free every kept frame (the player closed or the session changed). */
  dispose(): void {
    this.disposed = true;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
