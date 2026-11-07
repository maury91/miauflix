import type { ClaimKind } from '../storage/types';

/**
 * Connection budget priorities (maury91/webtorrent fork). Each torrent's share of the client's
 * `connectionBudget` is its priority over the sum of all attached torrents' priorities, so with one
 * stream and four background torrents the stream gets 10/14 of the budget. The budget only limits
 * new connections once it is used up; no torrent loses peers it already has.
 */
export const TORRENT_PRIORITY = {
  /** A viewer is reading one of the torrent's files. */
  streaming: 10,
  /** Playback was requested but no stream is open yet (metadata, a seek between requests). */
  playback: 6,
  /** The viewer is about to play: the title is open or focused. */
  warmup: 4,
  /** Downloads nobody is waiting for: next episodes, kept watched files. */
  background: 2,
  /** Seeding or watchlist downloads. */
  idle: 1,
} as const;

/** Share of the download limit left to torrents nobody is watching while a stream buffers. */
export const BACKGROUND_DOWNLOAD_SHARE = 0.25;

/** The connection priority a torrent starts with, before it has viewers. */
export const claimStartPriority = (kind: ClaimKind): number => {
  switch (kind) {
    case 'playback':
      return TORRENT_PRIORITY.playback;
    case 'warmup':
      return TORRENT_PRIORITY.warmup;
    case 'prefetch':
    case 'watched':
      return TORRENT_PRIORITY.background;
    case 'watchlist':
      return TORRENT_PRIORITY.idle;
  }
};

/** The connection priority for a torrent, from its open streams and its sources' live claims. */
export const torrentPriority = ({
  streams,
  claimKinds,
}: {
  streams: number;
  claimKinds: Iterable<ClaimKind>;
}): number => {
  if (streams > 0) return TORRENT_PRIORITY.streaming;
  let priority: number = TORRENT_PRIORITY.idle;
  for (const kind of claimKinds) priority = Math.max(priority, claimStartPriority(kind));
  return priority;
};

/**
 * A torrent's own download limit in bytes per second, or -1 for none (the client's global limit
 * still applies). While a stream is still buffering, torrents without a viewer share a quarter of
 * the global limit, so the stream gets the rest. With no (or no finite) global limit there is no share
 * to give.
 */
export const torrentDownloadCap = ({
  streams,
  streamBuffering,
  downloadLimit,
}: {
  streams: number;
  streamBuffering: boolean;
  downloadLimit: number;
}): number => {
  if (streams > 0 || !streamBuffering) return -1;
  // A huge configured limit can parse to Infinity, which the fork's throttle rejects.
  if (!Number.isFinite(downloadLimit) || downloadLimit <= 0) return -1;
  return Math.max(1, Math.round(downloadLimit * BACKGROUND_DOWNLOAD_SHARE));
};
