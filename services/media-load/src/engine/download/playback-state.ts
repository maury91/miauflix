import { logger } from '../../lib/logger';

/**
 * What viewers are doing right now, in memory only: open streams by source and file, where they
 * read, which reads wait on a piece, and when bytes last reached them. Listeners hear every
 * change of the set of sources with an open stream.
 */
export class PlaybackState {
  /** Open streams across every source. */
  private activeStreams = 0;
  /** Open streams by source. */
  private readonly activeSourceCounts = new Map<number, number>();
  /** Open streams by source and file path. */
  private readonly activeSourceFiles = new Map<number, Map<string, number>>();
  /** Playback reads waiting on a piece, by source, with when each started waiting. */
  private readonly blockedReadsBySource = new Map<number, Map<symbol, number>>();
  /** When bytes last reached a viewer, by source. */
  private readonly lastDeliveryAt = new Map<number, number>();
  /** Where viewers last read in the media, as a fraction of the file, by source and file path. */
  private readonly readFraction = new Map<number, Map<string, number>>();
  private readonly playbackListeners = new Set<(activeSourceIds: number[]) => void>();

  get streamCount(): number {
    return this.activeStreams;
  }

  /** Sources with an open stream. */
  activeSourceIds(): number[] {
    return [...this.activeSourceCounts.keys()];
  }

  /** Open streams of one source. */
  sourceStreamCount(sourceId: number): number {
    return this.activeSourceCounts.get(sourceId) ?? 0;
  }

  /** Every source with its open-stream count (zero counts included, as recorded). */
  sourceStreamCounts(): IterableIterator<[number, number]> {
    return this.activeSourceCounts.entries();
  }

  hasActivePlayback(): boolean {
    return this.activeStreams > 0;
  }

  isPlaybackActive(sourceId: number): boolean {
    return (this.activeSourceCounts.get(sourceId) ?? 0) > 0;
  }

  /** File paths of a source with an open stream. */
  activeFiles(sourceId: number): Map<string, number> | undefined {
    return this.activeSourceFiles.get(sourceId);
  }

  /** Every source with the file paths it is streaming. */
  activeFilesBySource(): IterableIterator<[number, Map<string, number>]> {
    return this.activeSourceFiles.entries();
  }

  /** Count one more stream of a file. */
  openStream(sourceId: number, path: string): void {
    this.activeStreams += 1;
    this.activeSourceCounts.set(sourceId, (this.activeSourceCounts.get(sourceId) ?? 0) + 1);
    this.changeActiveFileCount(sourceId, path, 1);
  }

  /** Count one stream of a file fewer. */
  closeStream(sourceId: number, path: string): void {
    this.activeStreams = Math.max(0, this.activeStreams - 1);
    const remaining = (this.activeSourceCounts.get(sourceId) ?? 1) - 1;
    if (remaining > 0) this.activeSourceCounts.set(sourceId, remaining);
    else this.activeSourceCounts.delete(sourceId);
    this.changeActiveFileCount(sourceId, path, -1);
  }

  /** Hear every change of the sources with an open stream; returns the unsubscribe function. */
  onPlaybackChange(listener: (activeSourceIds: number[]) => void): () => void {
    this.playbackListeners.add(listener);
    return () => this.playbackListeners.delete(listener);
  }

  notifyPlaybackChange(): void {
    const ids = this.activeSourceIds();
    for (const listener of this.playbackListeners) {
      try {
        listener(ids);
      } catch (error) {
        logger.warn('DownloadService', 'Playback change listener failed', error);
      }
    }
  }

  /** Playback reads of a source waiting on a piece; add and delete entries as they wait. */
  blockedReads(sourceId: number): Map<symbol, number> {
    let reads = this.blockedReadsBySource.get(sourceId);
    if (!reads) {
      reads = new Map();
      this.blockedReadsBySource.set(sourceId, reads);
    }
    return reads;
  }

  /** When the longest-waiting playback read of a source started waiting, if one is. */
  blockedSince(sourceId: number): number | null {
    const blocked = [...(this.blockedReadsBySource.get(sourceId)?.values() ?? [])];
    return blocked.length ? Math.min(...blocked) : null;
  }

  markDelivered(sourceId: number): void {
    this.lastDeliveryAt.set(sourceId, Date.now());
  }

  lastDelivery(sourceId: number): number | null {
    return this.lastDeliveryAt.get(sourceId) ?? null;
  }

  setReadFraction(sourceId: number, path: string, fraction: number): void {
    const fractions = this.readFraction.get(sourceId) ?? new Map<string, number>();
    fractions.set(path, fraction);
    this.readFraction.set(sourceId, fractions);
  }

  readFractionOf(sourceId: number, path: string): number | undefined {
    return this.readFraction.get(sourceId)?.get(path);
  }

  private changeActiveFileCount(sourceId: number, path: string, delta: -1 | 1): void {
    const paths = this.activeSourceFiles.get(sourceId) ?? new Map<string, number>();
    const count = (paths.get(path) ?? 0) + delta;
    if (count > 0) paths.set(path, count);
    else {
      paths.delete(path);
      const fractions = this.readFraction.get(sourceId);
      fractions?.delete(path);
      if (fractions && !fractions.size) this.readFraction.delete(sourceId);
    }
    if (paths.size) this.activeSourceFiles.set(sourceId, paths);
    else this.activeSourceFiles.delete(sourceId);
  }
}
