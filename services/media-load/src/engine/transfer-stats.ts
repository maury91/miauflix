import type { TransferState } from '@miauflix/service-contracts';
import type { Torrent } from 'webtorrent';

import { logger } from '../lib/logger';
import type { TransferRepository, TransferWindow } from '../storage/transfer.repository';

type Live = Pick<TransferState, 'downloadSpeed' | 'peers' | 'uploadSpeed'>;

export interface TransferStatsOptions {
  /** How often peers are counted. */
  sampleMs?: number;
  /** Peer counts per window: a window lasts `sampleMs * windowSamples`. */
  windowSamples?: number;
  /** How long samples are kept. */
  retentionMs?: number;
}

const IDLE: Live = { downloadSpeed: 0, uploadSpeed: 0, peers: 0 };

/**
 * Per-source transfer statistics. Peers are counted every second; every 5 seconds each loaded
 * torrent's received and uploaded bytes since the previous window become its speeds (the window
 * average) and are added to the source's lifetime totals, and the sample is stored for a day.
 */
export class TransferStats {
  /** Byte counters of each torrent at the end of the previous window (they start at 0). */
  private readonly counters = new WeakMap<Torrent, { received: number; uploaded: number }>();
  private peerCounts = new Map<Torrent, { sum: number; count: number }>();
  private live = new Map<number, Live>();
  private ticks = 0;
  private windowStart: number;
  private lastPrune = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sampleMs: number;
  private readonly windowSamples: number;
  private readonly retentionMs: number;

  constructor(
    private readonly client: { torrents: Torrent[] },
    private readonly repository: TransferRepository,
    options: TransferStatsOptions = {}
  ) {
    this.sampleMs = options.sampleMs ?? 1_000;
    this.windowSamples = options.windowSamples ?? 5;
    this.retentionMs = options.retentionMs ?? 24 * 60 * 60 * 1000;
    this.windowStart = Date.now();
  }

  start(): void {
    if (this.timer) return;
    this.windowStart = Date.now();
    this.timer = setInterval(() => this.tick(), this.sampleMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Count peers; close the window every `windowSamples` ticks. */
  tick(now = Date.now()): void {
    for (const torrent of this.client.torrents) {
      const count = this.peerCounts.get(torrent) ?? { sum: 0, count: 0 };
      count.sum += torrent.numPeers ?? 0;
      count.count++;
      this.peerCounts.set(torrent, count);
    }
    if (++this.ticks % this.windowSamples) return;
    try {
      this.closeWindow(now);
    } catch (error) {
      logger.warn('TransferStats', 'Failed to record transfer statistics', error);
    }
  }

  private closeWindow(now: number): void {
    const seconds = Math.max((now - this.windowStart) / 1000, 0.001);
    this.windowStart = now;
    const peerCounts = this.peerCounts;
    this.peerCounts = new Map();
    const storages = new Map(this.repository.locations().map(row => [row.location, row]));
    const live = new Map<number, Live>();
    const windows: TransferWindow[] = [];
    for (const torrent of this.client.torrents) {
      const previous = this.counters.get(torrent) ?? { received: 0, uploaded: 0 };
      const current = { received: torrent.received ?? 0, uploaded: torrent.uploaded ?? 0 };
      this.counters.set(torrent, current);
      const storage = storages.get(torrent.path);
      // Torrents without storage (metadata lookups) are not a source's transfer.
      if (!storage) continue;
      const downloaded = Math.max(0, current.received - previous.received);
      const uploaded = Math.max(0, current.uploaded - previous.uploaded);
      const peers = peerCounts.get(torrent);
      const sample: Live = {
        downloadSpeed: Math.round(downloaded / seconds),
        uploadSpeed: Math.round(uploaded / seconds),
        peers: peers ? Math.round((peers.sum / peers.count) * 10) / 10 : (torrent.numPeers ?? 0),
      };
      live.set(storage.sourceId, sample);
      windows.push({ storageId: storage.id, at: now, downloaded, uploaded, ...sample });
    }
    this.live = live;
    this.repository.record(windows);
    if (now - this.lastPrune >= 60_000) {
      this.lastPrune = now;
      this.repository.prune(now - this.retentionMs);
    }
  }

  /** The source's last window averages (zero when its torrent is not loaded). */
  liveFor(sourceId: number): Live {
    return this.live.get(sourceId) ?? IDLE;
  }

  /** Last window averages and lifetime totals of every stored source. */
  states(): Map<number, TransferState> {
    const states = new Map<number, TransferState>();
    for (const [sourceId, totals] of this.repository.totals())
      states.set(sourceId, { ...this.liveFor(sourceId), ...totals });
    return states;
  }
}
