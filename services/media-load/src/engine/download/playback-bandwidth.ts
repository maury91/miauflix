import type { Torrent } from 'webtorrent';

import { logger } from '../../lib/logger';
import type { StorageService } from '../../storage/storage.service';
import type { ClaimKind } from '../../storage/types';
import { isFileCompleteInBitfield } from '../download.utils';
import type { EngineConfig } from '../engine-config';
import { torrentDownloadCap, torrentPriority } from '../torrent-priority';
import type { ClaimSelection } from './claim-selection';
import type { PlaybackState } from './playback-state';
import type { TorrentAttacher } from './torrent-attacher';

/**
 * Bandwidth goes to whoever is watching: each torrent's connection priority and download cap
 * follow its streams and claims, and speculative downloads pause while a stream is buffering and
 * resume once it has its file.
 */
export class PlaybackBandwidth {
  /** Sources paused so a stream could buffer; only these are resumed afterwards. */
  private readonly pausedForPlayback = new Set<number>();
  /** Connection priority and download cap last applied to each torrent. */
  private readonly appliedTorrentLimits = new WeakMap<
    Torrent,
    { priority: number; downloadCap: number }
  >();
  private priorityRefresh: Promise<void> | null = null;
  private priorityRefreshAgain = false;
  /** Whether the last priority pass capped torrents because a stream was buffering. */
  private bufferingCapsApplied = false;

  constructor(
    private readonly storageService: StorageService,
    private readonly config: EngineConfig,
    private readonly torrents: TorrentAttacher,
    private readonly playback: PlaybackState,
    private readonly selection: ClaimSelection,
    /** Sources tracked on a torrent; a torrent without any keeps the priority it was added with. */
    private readonly sourcesOf: (torrent: Torrent) => ReadonlySet<number> | undefined
  ) {}

  /** Forget that a source was paused for playback (it was removed or detached). */
  forget(sourceId: number): void {
    this.pausedForPlayback.delete(sourceId);
  }

  /**
   * Pause a background source while another source's stream is still buffering; it resumes with
   * the other speculative downloads once that stream has its file.
   */
  async yieldToBufferingPlayback(sourceId: number): Promise<void> {
    const shouldYield = async () =>
      this.playback.streamCount > 0 &&
      !this.playback.sourceStreamCount(sourceId) &&
      (await this.hasIncompleteActivePlayback(sourceId));
    if (await shouldYield()) await this.pauseForPlayback(sourceId, shouldYield);
  }

  /** Pause only speculative torrents while the first active stream is consuming bandwidth. */
  async pauseSpeculativeDownloads(excludeSourceId: number): Promise<void> {
    if (!(await this.hasIncompleteActivePlayback())) return;
    const sourceIds = (await this.storageService.getSpeculativeSourceIds()) ?? [];
    // Every pause settles before a failure is reported, so the caller can resume all that paused.
    const results = await Promise.allSettled(
      sourceIds
        .filter(
          sourceId => sourceId !== excludeSourceId && !this.playback.isPlaybackActive(sourceId)
        )
        .map(sourceId =>
          this.pauseForPlayback(
            sourceId,
            async () =>
              !this.playback.isPlaybackActive(sourceId) &&
              (await this.hasIncompleteActivePlayback())
          )
        )
    );
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }

  /**
   * Pause a source for a buffering stream. The source is tracked before the pause starts, so a
   * readiness check that runs meanwhile takes and resumes it. If the reason went away (the stream
   * buffered or ended, or this source started streaming), it is resumed here instead of tracked.
   */
  private async pauseForPlayback(
    sourceId: number,
    stillQualifies: () => Promise<boolean>
  ): Promise<void> {
    // An earlier pause may already track it; a failed pause here must not drop that tracking.
    const trackedBefore = this.pausedForPlayback.has(sourceId);
    this.pausedForPlayback.add(sourceId);
    let paused = false;
    try {
      paused = await this.selection.pauseDownload(sourceId);
    } finally {
      if (!paused && !trackedBefore) this.pausedForPlayback.delete(sourceId);
    }
    if (!paused) return;
    // A resume ran while pausing and may have landed first: resume again so it is not left paused.
    if (!this.pausedForPlayback.has(sourceId)) return this.resumeOrKeep([sourceId]);
    const qualifies = await stillQualifies().catch(error => {
      logger.warn('DownloadService', `Failed to recheck the pause of source ${sourceId}`, error);
      return false;
    });
    if (qualifies) return;
    // A readiness check that ran during the recheck already resumed it.
    if (this.pausedForPlayback.delete(sourceId)) await this.resumeOrKeep([sourceId]);
  }

  /** Resume sources; one whose resume failed or did nothing stays tracked for the next check. */
  private async resumeOrKeep(sourceIds: number[]): Promise<void> {
    const results = await Promise.allSettled(
      sourceIds.map(sourceId => this.selection.resumeDownload(sourceId))
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected' || !result.value)
        this.pausedForPlayback.add(sourceIds[index]);
    });
  }

  /** Resume only torrents paused by playback admission; unrelated pauses remain untouched. */
  async resumeSpeculativeDownloads(): Promise<void> {
    const sourceIds = [...this.pausedForPlayback];
    this.pausedForPlayback.clear();
    // A resume that failed keeps its source, so the next readiness check retries it.
    await this.resumeOrKeep(sourceIds);
    // The stream has buffered its file (or ended): lift the caps on the other torrents.
    this.refreshTorrentPriorities();
  }

  async resumeSpeculativeDownloadsWhenPlaybackReady(): Promise<void> {
    if (!this.pausedForPlayback.size && !this.bufferingCapsApplied) return;
    if (await this.hasIncompleteActivePlayback()) return;
    // Resuming refreshes priorities too; without paused sources the caps still have to go.
    if (this.pausedForPlayback.size) await this.resumeSpeculativeDownloads();
    else this.refreshTorrentPriorities();
  }

  /**
   * Recompute every attached torrent's connection priority and download cap. Calls made while a
   * refresh runs coalesce into one more pass, since claims and streams change in bursts.
   */
  refreshTorrentPriorities(): void {
    if (this.priorityRefresh) {
      this.priorityRefreshAgain = true;
      return;
    }
    this.priorityRefresh = (async () => {
      try {
        do {
          this.priorityRefreshAgain = false;
          try {
            await this.applyTorrentPriorities();
          } catch (error) {
            logger.warn('DownloadService', 'Failed to update torrent priorities', error);
          }
        } while (this.priorityRefreshAgain);
      } finally {
        // Cleared in the same step as the last check, so no later call is left without a pass.
        this.priorityRefresh = null;
      }
    })();
  }

  private async applyTorrentPriorities(): Promise<void> {
    const streamBuffering =
      this.playback.streamCount > 0 && (await this.hasIncompleteActivePlayback());
    this.bufferingCapsApplied = streamBuffering;
    const downloadLimit = Number(this.config.getOrThrow('CONTENT_DOWNLOAD_LIMIT'));
    for (const torrent of this.torrents.client.torrents) {
      if (torrent.destroyed) continue;
      const sourceIds = this.sourcesOf(torrent);
      // Until its files are known a torrent keeps the priority it was added with.
      if (!sourceIds?.size) continue;
      let streams = 0;
      const claimKinds = new Set<ClaimKind>();
      for (const sourceId of sourceIds) {
        streams += this.playback.sourceStreamCount(sourceId);
        for (const claim of await this.storageService.getLiveClaims(sourceId)) {
          claimKinds.add(claim.kind);
        }
      }
      if (torrent.destroyed) continue;
      const priority = torrentPriority({ streams, claimKinds });
      const downloadCap = torrentDownloadCap({ streams, streamBuffering, downloadLimit });
      const applied = this.appliedTorrentLimits.get(torrent);
      if (applied?.priority !== priority) torrent.setPriority?.(priority);
      if ((applied?.downloadCap ?? -1) !== downloadCap)
        torrent.throttleDownloadSpeed?.(downloadCap);
      this.appliedTorrentLimits.set(torrent, { priority, downloadCap });
    }
  }

  /** Whether a stream (of another source than `excludeSourceId`) still misses part of its file. */
  async hasIncompleteActivePlayback(excludeSourceId?: number): Promise<boolean> {
    for (const [sourceId, streamCount] of this.playback.sourceStreamCounts()) {
      if (!streamCount || sourceId === excludeSourceId) continue;
      const storage = await this.storageService.getStorageBySource(sourceId);
      if (!storage) return true;
      if (storage.videoCompletedAt || storage.localOnly) continue;
      const layout = storage.encryptedLayout;
      if (!layout) return true;
      const torrent = this.torrents.torrentAt(storage.location);
      const bitfield = torrent?.bitfield?.buffer ?? storage.downloadedPieces;
      const paths = this.playback.activeFiles(sourceId);
      if (!paths?.size) return true;
      for (const path of paths.keys()) {
        if (!isFileCompleteInBitfield(layout, path, bitfield)) return true;
      }
    }
    return false;
  }
}
