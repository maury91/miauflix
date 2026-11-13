import type { ClaimRequest } from '@miauflix/service-contracts';

import type { ClaimKind } from '../../storage/types';

export const MAX_SIDECAR_BYTES = 2 * 1024 * 1024;
export const MATROSKA_TAIL_BYTES = 2 * 1024 * 1024;
/** File start kept with a mid-file warmup: the player reads the header before it seeks. */
export const RESUME_HEADER_BYTES = 4 * 1024 * 1024;
/**
 * A resume offset is position / duration × length, which misses on variable-bitrate files, so a
 * resume warmup starts this much earlier.
 */
export const RESUME_LEAD_BYTES = 16 * 1024 * 1024;
/** Containers whose index may sit at the end of the file, so warmups also fetch the tail. */
export const TAIL_INDEXED_FILE = /\.(mkv|webm|mp4|m4v|mov)$/i;
/** Pieces, from the one a reader is blocked on, that it selects and marks critical. */
export const READER_WINDOW_PIECES = 2;
/** Above every claim priority: a reader is waiting on these bytes right now. */
export const READER_PRIORITY = 100;
/**
 * Seconds of video a viewer's stream keeps selected ahead of its read position, so the playhead
 * is fetched from every peer before the reader blocks on it, not two pieces at a time.
 */
export const READAHEAD_SECONDS = 90;
export const READAHEAD_MIN_BYTES = 32 * 1024 * 1024;
export const READAHEAD_MAX_BYTES = 512 * 1024 * 1024;
/** Below a blocked reader, above every claim: the bytes the viewer reaches next. */
export const READAHEAD_PRIORITY = READER_PRIORITY - 1;
/** Assumed runtime when the caller does not know it, as PlaybackSessionService assumes. */
export const DEFAULT_DURATION_SECONDS = { movie: 7_200, episode: 2_700 } as const;
/** Bytes a stream hands the response per read: a slice of the current piece. */
export const STREAM_SLICE_BYTES = 256 * 1024;

/**
 * Pieces WebTorrent keeps decrypted in memory per torrent (its default is 20, i.e. 40-160 MB per
 * torrent with typical piece sizes). Streams read from disk, so this only serves peers.
 */
export const TORRENT_STORE_CACHE_SLOTS = 2;
export const CLAIM_SWEEP_INTERVAL_MS = 60_000;

/** How long a claim of each kind lasts without renewal; null never expires. */
export const CLAIM_TTL_MS: Record<ClaimKind, number | null> = {
  playback: 2 * 60_000,
  prefetch: 24 * 60 * 60_000,
  warmup: 10 * 60_000,
  watched: null,
  watchlist: 30 * 60_000,
};

/** Reads keep their file wanted for a short while; every range request renews it. */
export const PLAYBACK_CLAIM: ClaimRequest = { kind: 'playback', ownerKey: 'stream' };
export const SIDECAR_SUBTITLE = /\.(srt|vtt|ass|ssa)$/i;
export const VPN_REQUIRED_MESSAGE = 'Media load requires a protected connection';
