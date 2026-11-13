import type {
  ClaimRequest,
  PlaybackHealth,
  StorageActivity,
  WarmupRangeProgress,
  WarmupResult,
} from '@miauflix/service-contracts';
import type WebTorrent from 'webtorrent';

import type { StorageService } from '../storage/storage.service';
import type {
  ClaimKind,
  ContentSource,
  EncryptedStorageLayout,
  PlaybackTarget,
  Storage,
} from '../storage/types';
import { ClaimRequests, type StartDownload } from './download/claim-requests';
import { ClaimSelection } from './download/claim-selection';
import { CompletionTracker } from './download/completion-tracker';
import { CLAIM_SWEEP_INTERVAL_MS } from './download/constants';
import { DownloadLifecycle, type StartDownloadOptions } from './download/download-lifecycle';
import { DownloadStatus } from './download/download-status';
import { EngineStartup } from './download/engine-startup';
import { FileStreamer } from './download/file-streamer';
import { PlaybackBandwidth } from './download/playback-bandwidth';
import { PlaybackState } from './download/playback-state';
import { SeedScheduler } from './download/seed-scheduler';
import { StorageHooks } from './download/storage-hooks';
import { TorrentAttacher } from './download/torrent-attacher';
import type {
  DownloadProgress,
  EngineStatus,
  GreedyDownload,
  StorageActivitySnapshot,
} from './download/types';
import type { EngineConfig } from './engine-config';

export type { ClaimRequest, PlaybackHealth, StorageActivity, WarmupRangeProgress, WarmupResult };
export type { DownloadProgress, EngineStatus, GreedyDownload, StorageActivitySnapshot };
export { CLAIM_TTL_MS } from './download/constants';
export { readaheadPieceCount } from './download/file-streamer';
export { storageEncryptionVersion, storeEncryptionOptions } from './download/layout';

/**
 * The media-load engine's entry point. It wires the units under `./download/` together and
 * delegates to them; it holds no download state of its own:
 *
 * - `TorrentAttacher`: the WebTorrent client, trackers, network kill switch, adding torrents.
 * - `DownloadLifecycle`: admitting and claiming files, attaching and detaching torrents.
 * - `ClaimRequests`: warmups, promotions, background downloads and subtitle sidecars.
 * - `ClaimSelection`: live claims applied to a torrent's selection; pause and resume.
 * - `CompletionTracker`: verified pieces persisted, files and sources recorded complete.
 * - `SeedScheduler`: the seeding window of completed downloads.
 * - `PlaybackState` / `PlaybackBandwidth`: open streams, and the bandwidth they get.
 * - `FileStreamer`: byte-range responses read from the encrypted store.
 * - `EngineStartup`: startup checks and the restore of seeding on boot.
 * - `StorageHooks`: the delete and reclaim handlers StorageService calls.
 * - `DownloadStatus`: read-only progress, activity and health.
 */
export class DownloadService {
  public readonly client: WebTorrent;
  private readonly torrents: TorrentAttacher;
  private readonly playback = new PlaybackState();
  private readonly seeding: SeedScheduler;
  private readonly selection: ClaimSelection;
  private readonly bandwidth: PlaybackBandwidth;
  private readonly tracker: CompletionTracker;
  private readonly lifecycle: DownloadLifecycle;
  private readonly requests: ClaimRequests;
  private readonly streamer: FileStreamer;
  private readonly status: DownloadStatus;
  private readonly startup: EngineStartup;
  private readonly hooks: StorageHooks;
  private readonly claimSweep: NodeJS.Timeout;

  constructor(
    storageService: StorageService,
    config: EngineConfig,
    /** DHT bootstrap nodes (`ip:port`); see `resolveDhtBootstrap`. Default: the DHT's own. */
    dhtBootstrap?: string[],
    { networkAllowed = true }: { networkAllowed?: boolean } = {}
  ) {
    this.torrents = new TorrentAttacher(config, {
      dhtBootstrap,
      networkAllowed,
      streamStats: () => ({
        activeStreams: this.playback.streamCount,
        activeSources: this.playback.activeSourceIds().length,
      }),
      onFenceFailure: () => this.startup.markRestorePending(),
    });
    this.client = this.torrents.client;
    this.seeding = new SeedScheduler(storageService, config, this.torrents);
    this.selection = new ClaimSelection(storageService, this.torrents, () =>
      this.bandwidth.refreshTorrentPriorities()
    );
    this.bandwidth = new PlaybackBandwidth(
      storageService,
      config,
      this.torrents,
      this.playback,
      this.selection,
      torrent => this.tracker.sourcesOf(torrent)
    );
    this.tracker = new CompletionTracker(storageService, this.seeding, this.bandwidth);
    this.lifecycle = new DownloadLifecycle(
      storageService,
      config,
      this.torrents,
      this.playback,
      this.selection,
      this.bandwidth,
      this.seeding,
      this.tracker
    );
    // Requests and streams claim through the public `startDownload`, the one entry point.
    const startDownload: StartDownload = (...args) => this.startDownload(...args);
    this.requests = new ClaimRequests(
      storageService,
      startDownload,
      this.lifecycle,
      this.selection,
      this.bandwidth
    );
    this.streamer = new FileStreamer(
      storageService,
      config,
      this.torrents,
      this.playback,
      this.bandwidth,
      startDownload
    );
    this.status = new DownloadStatus(storageService, this.torrents, this.playback, this.seeding);
    this.startup = new EngineStartup(
      storageService,
      config,
      this.torrents,
      this.selection,
      this.seeding,
      this.tracker
    );

    this.claimSweep = setInterval(() => void this.sweepExpiredClaims(), CLAIM_SWEEP_INTERVAL_MS);
    this.claimSweep.unref?.();
    void this.startup.init();

    this.hooks = new StorageHooks(
      storageService,
      config,
      this.torrents,
      this.selection,
      this.bandwidth,
      this.seeding,
      this.tracker
    );
    this.hooks.register();
  }

  // Engine state

  getStatus(): EngineStatus {
    return this.startup.getStatus();
  }

  /**
   * Take over storage recorded elsewhere (the backend's import): seed completed downloads whose
   * seeding period has not ended, detach expired ones, and schedule the rest.
   */
  adoptStorage(): Promise<void> {
    return this.startup.adoptStorage();
  }

  reload(): Promise<void> {
    return this.startup.reload();
  }

  /**
   * The kill switch for an unprotected connection. Blocked: every torrent stops reaching trackers
   * and peers, and nothing new is added, so only files already stored can be read. Allowed again:
   * torrents resume, and a seeding restore that waited for the network runs.
   */
  async setNetworkAllowed(allowed: boolean): Promise<void> {
    if (allowed === this.torrents.isNetworkAllowed) return;
    if (!allowed) this.startup.noteNetworkBlocked();
    this.torrents.setNetworkAllowed(allowed);
    if (allowed) await this.startup.restoreIfPending();
  }

  /** Apply the current seed duration to completed downloads without resetting playback claims. */
  rescheduleSeedExpiry(): Promise<void> {
    return this.seeding.rescheduleSeedExpiry();
  }

  async close(): Promise<void> {
    clearInterval(this.claimSweep);
    this.seeding.cancelAll();
    await this.torrents.close();
  }

  // Playback

  /** Sources with an open stream. */
  activePlaybackSourceIds(): number[] {
    return this.playback.activeSourceIds();
  }

  /** Hear every change of the sources with an open stream; returns the unsubscribe function. */
  onPlaybackChange(listener: (activeSourceIds: number[]) => void): () => void {
    return this.playback.onPlaybackChange(listener);
  }

  hasActivePlayback(): boolean {
    return this.playback.hasActivePlayback();
  }

  isPlaybackActive(sourceId: number): boolean {
    return this.playback.isPlaybackActive(sourceId);
  }

  streamFile(target: PlaybackTarget, rangeHeader?: string, speculative = false): Promise<Response> {
    return this.streamer.streamFile(target, rangeHeader, speculative);
  }

  // Status

  getPlaybackHealth(sourceId: number, filePath?: string): Promise<PlaybackHealth | null> {
    return this.status.getPlaybackHealth(sourceId, filePath);
  }

  getStorageActivity(
    storage: Pick<Storage, 'localOnly' | 'location' | 'videoCompletedAt'> & {
      contentSource?: { hash: string } | null;
    }
  ): StorageActivitySnapshot {
    return this.status.getStorageActivity(storage);
  }

  getDownloadProgress(sourceId: number): Promise<DownloadProgress | null> {
    return this.status.getDownloadProgress(sourceId);
  }

  isRangeVerified(
    sourceId: number,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): Promise<boolean> {
    return this.status.isRangeVerified(sourceId, filePath, firstPiece, lastPiece);
  }

  getRangeProgress(
    sourceId: number,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): Promise<WarmupRangeProgress> {
    return this.status.getRangeProgress(sourceId, filePath, firstPiece, lastPiece);
  }

  isFileComplete(sourceId: number, filePath: string): Promise<boolean> {
    return this.status.isFileComplete(sourceId, filePath);
  }

  // Sources and torrents

  generateLink(hash: string, trackers: string[], name = ''): string {
    return this.torrents.generateLink(hash, trackers, name);
  }

  getSourceMetadataFile(sourceLink: string, hash: string, timeout: number): Promise<Buffer> {
    return this.torrents.getSourceMetadataFile(sourceLink, hash, timeout);
  }

  /** File list of a source, from storage or its torrent file, without attaching the torrent. */
  getKnownLayout(source: ContentSource): Promise<EncryptedStorageLayout | null> {
    return this.lifecycle.getKnownLayout(source);
  }

  /**
   * File list of a source. When neither storage nor a torrent file knows it, the torrent is
   * attached with nothing selected so its metadata arrives through the normal download path.
   */
  resolveLayout(source: ContentSource): Promise<EncryptedStorageLayout> {
    return this.lifecycle.resolveLayout(source);
  }

  /** The target's file table; attaches the torrent only when the source's files are unknown. */
  getMediaFiles(target: PlaybackTarget): Promise<EncryptedStorageLayout> {
    return this.resolveLayout(target.source);
  }

  // Downloads and claims

  /** Claim a file and attach its source's torrent, or read it from disk when it is stored. */
  startDownload(
    target: PlaybackTarget,
    claim: ClaimRequest,
    options: StartDownloadOptions = {}
  ): Promise<GreedyDownload> {
    return this.lifecycle.startDownload(target, claim, options);
  }

  warmSource(
    target: PlaybackTarget,
    targetBytes: number,
    leaseKey: string,
    startFraction = 0
  ): Promise<WarmupResult> {
    return this.requests.warmSource(target, targetBytes, leaseKey, startFraction);
  }

  pauseSource(sourceId: number): Promise<boolean> {
    return this.requests.pauseSource(sourceId);
  }

  promoteSource(target: PlaybackTarget, ownerKey: string): Promise<boolean> {
    return this.requests.promoteSource(target, ownerKey);
  }

  predownload(target: PlaybackTarget, claim: ClaimRequest): Promise<boolean> {
    return this.requests.predownload(target, claim);
  }

  prepareSubtitleFiles(target: PlaybackTarget, paths: string[]): Promise<void> {
    return this.requests.prepareSubtitleFiles(target, paths);
  }

  /** Drop expired claims and stop downloading what nobody wants any more. */
  sweepExpiredClaims(): Promise<void> {
    return this.lifecycle.sweepExpiredClaims();
  }

  /** Withdraw one owner's claims on a source (for example a removed watchlist entry). */
  releaseClaims(sourceId: number, ownerKey: string, kind?: ClaimKind): Promise<void> {
    return this.lifecycle.releaseClaims(sourceId, ownerKey, kind);
  }

  pauseDownload(sourceId: number): Promise<boolean> {
    return this.selection.pauseDownload(sourceId);
  }

  resumeDownload(sourceId: number): Promise<boolean> {
    return this.selection.resumeDownload(sourceId);
  }

  cancelDownload(sourceId: number): Promise<boolean> {
    return this.lifecycle.cancelDownload(sourceId);
  }
}
