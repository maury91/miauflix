import { logger } from '@logger';
import type { EncryptedStorageLayout } from '@miauflix/service-contracts';

import type { ContentSource } from '@entities/content-source.entity';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';

import {
  applyPiecesUpdate,
  type DownloadedRanges,
  downloadedRanges,
  mergeSnapshot,
  type SourcePieces,
} from './downloaded-ranges';
import type { LivePlayback, PlaybackSessionService } from './playback-session.service';

/** Downloaded stretches of one playback's file, for the player's seek bar. */
export interface PlaybackPiecesUpdate {
  userId: string;
  sessionId?: string;
  playbackId: string;
  ranges: DownloadedRanges;
}

const TICK_MS = 1_000;

const sameRanges = (a: DownloadedRanges | undefined, b: DownloadedRanges) =>
  a?.length === b.length &&
  a.every(([start, end], index) => start === b[index][0] && end === b[index][1]);

/**
 * Pushes which parts of each played file are downloaded. The sources' verified pieces are
 * mirrored from media-load (`piecesChanged`, started from `storageBitfields`); every second
 * each live playback's ranges are worked out and sent when they changed.
 */
export class PlaybackPiecesService {
  private readonly pieces = new Map<number, SourcePieces>();
  /** Sources whose snapshot was asked for (cleared on resync, so it is asked again). */
  private readonly requested = new Set<number>();
  private readonly layouts = new Map<number, Promise<EncryptedStorageLayout | null>>();
  private readonly resolvedLayouts = new Map<number, EncryptedStorageLayout | null>();
  private readonly sent = new Map<string, PlaybackPiecesUpdate>();
  private readonly listeners = new Set<(update: PlaybackPiecesUpdate) => void>();
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly sessions: Pick<PlaybackSessionService, 'livePlaybacks'>,
    private readonly mediaLoad: Pick<
      MediaLoadClientService,
      'getStorageBitfields' | 'onPieces' | 'resolveLayout'
    >,
    private readonly sources: { findById(sourceId: number): Promise<ContentSource | null> }
  ) {
    this.unsubscribe = mediaLoad.onPieces(
      update => {
        const next = applyPiecesUpdate(this.pieces.get(update.sourceId), update);
        if (next.totalPieces) this.pieces.set(update.sourceId, next);
        else this.pieces.delete(update.sourceId);
      },
      () => this.requested.clear()
    );
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  /** Hear every playback's changed ranges; returns the unsubscribe function. */
  onRanges(listener: (update: PlaybackPiecesUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The last ranges sent for a session's playbacks, for a tab that connects mid-playback. */
  latestFor(userId: string, sessionId: string): PlaybackPiecesUpdate[] {
    return [...this.sent.values()].filter(
      update => update.userId === userId && (!update.sessionId || update.sessionId === sessionId)
    );
  }

  /** Work out every live playback's ranges and send those that changed. */
  tick(): void {
    const playbacks = this.sessions.livePlaybacks();
    const live = new Set(playbacks.map(playback => playback.playbackId));
    for (const playbackId of this.sent.keys())
      if (!live.has(playbackId)) this.sent.delete(playbackId);
    const wanted = new Set(playbacks.map(playback => playback.sourceId));
    for (const sourceId of this.pieces.keys())
      if (!wanted.has(sourceId)) this.pieces.delete(sourceId);
    for (const sourceId of this.requested)
      if (!wanted.has(sourceId)) this.requested.delete(sourceId);
    const missing = [...wanted].filter(sourceId => !this.requested.has(sourceId));
    if (missing.length) this.requestSnapshots(missing);
    for (const playback of playbacks) this.update(playback);
  }

  private update(playback: LivePlayback): void {
    const pieces = this.pieces.get(playback.sourceId);
    const layout = this.layout(playback.sourceId);
    if (!pieces || !layout) return;
    const file = playedFile(layout, playback.filePath);
    if (!file) return;
    const ranges = downloadedRanges(pieces, layout.pieceLength, file);
    const previous = this.sent.get(playback.playbackId);
    if (previous && sameRanges(previous.ranges, ranges)) return;
    const update: PlaybackPiecesUpdate = {
      userId: playback.userId,
      sessionId: playback.sessionId,
      playbackId: playback.playbackId,
      ranges,
    };
    this.sent.set(playback.playbackId, update);
    for (const listener of this.listeners) {
      try {
        listener(update);
      } catch (error) {
        logger.warn('PlaybackPiecesService', 'Ranges listener failed', error);
      }
    }
  }

  private requestSnapshots(sourceIds: number[]): void {
    for (const sourceId of sourceIds) this.requested.add(sourceId);
    void this.mediaLoad
      .getStorageBitfields(sourceIds)
      .then(snapshots => {
        for (const snapshot of snapshots)
          if (snapshot.totalPieces)
            this.pieces.set(
              snapshot.sourceId,
              mergeSnapshot(this.pieces.get(snapshot.sourceId), snapshot)
            );
      })
      .catch(error => {
        // Asked again on the next tick; an older media-load answers `unsupported` every time.
        for (const sourceId of sourceIds) this.requested.delete(sourceId);
        logger.debug('PlaybackPiecesService', 'Storage bitfields unavailable', error);
      });
  }

  /** The source's file table once known; looked up once per source. */
  private layout(sourceId: number): EncryptedStorageLayout | null {
    const resolved = this.resolvedLayouts.get(sourceId);
    if (resolved) return resolved;
    if (!this.layouts.has(sourceId)) {
      const lookup = this.sources
        .findById(sourceId)
        .then(source => (source ? this.mediaLoad.resolveLayout(source) : null))
        .then(layout => {
          if (layout) this.resolvedLayouts.set(sourceId, layout);
          else this.layouts.delete(sourceId);
          return layout;
        })
        .catch(error => {
          this.layouts.delete(sourceId);
          logger.debug('PlaybackPiecesService', `Layout of source ${sourceId} unavailable`, error);
          return null;
        });
      this.layouts.set(sourceId, lookup);
    }
    return null;
  }

  close(): void {
    clearInterval(this.timer);
    this.unsubscribe();
    this.listeners.clear();
  }
}

/** The played file; before the stream resolves it, the source's largest file. */
const playedFile = (layout: EncryptedStorageLayout, filePath?: string) =>
  filePath
    ? layout.files.find(file => file.path === filePath)
    : layout.files.reduce<EncryptedStorageLayout['files'][number] | undefined>(
        (largest, file) => (!largest || file.length > largest.length ? file : largest),
        undefined
      );
