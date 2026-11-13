import type { StorageActivity } from '@miauflix/service-contracts';
import type { Torrent } from 'webtorrent';

import type { EncryptedStorageLayout, Storage } from '../../storage/types';

/** Engine startup state, as the backend's `ServiceInstanceStatus`. */
export type EngineStatus =
  | { status: 'initializing'; details: string; startedAt: number }
  | { status: 'ready' }
  | { status: 'error'; errorMessage: string; error: unknown };

export interface GreedyDownload {
  sourceId: number;
  torrent: Torrent | null;
  storage: Storage;
  layout: EncryptedStorageLayout;
  startTime: Date;
}

export interface DownloadProgress {
  sourceId: number;
  progress: number; // Percentage (0-100)
  downloadedBytes: number;
  totalBytes: number;
  downloadSpeed: number; // bytes/second
  isComplete: boolean;
}

export interface StorageActivitySnapshot {
  activity: StorageActivity;
  seedEndsAt: Date | null;
  videoComplete: boolean;
  torrentLoaded: boolean;
}

/** WebTorrent's stream selections (what its own file streams use), missing from its typings. */
export type StreamSelectingTorrent = Torrent & {
  _select(
    start: number,
    end: number,
    priority: number,
    notify: (() => void) | undefined,
    isStreamSelection: true
  ): void;
  _deselect(start: number, end: number, isStreamSelection: true): void;
};
