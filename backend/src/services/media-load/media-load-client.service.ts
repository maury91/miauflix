import { logger } from '@logger';
import { ContractError } from '@miauflix/contract';
import {
  type ClaimKind,
  type ClaimRequest,
  type EncryptedStorageLayout,
  type ImportedSource,
  mediaLoad,
  type MediaLoadError,
  type PiecesUpdate,
  type PlaybackHealth,
  type SourceDescriptor,
  type StorageBitfield,
  type StorageInventory,
  type StorageRemovalResult,
  type StorageState,
  type TargetRef,
  type WarmupRangeProgress,
  type WarmupResult,
} from '@miauflix/service-contracts';

import type { ContentSource } from '@entities/content-source.entity';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import { RemoteService } from '@services/remote/remote-service';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';

/** Contract codes that keep meaning the backend's `ErrorWithStatus` codes. */
const ENGINE_ERRORS = new Set<string>([
  'add_error',
  'add_torrent_timeout',
  'added_but_no_file',
  'greedy_download_failed',
  'invalid_torrent_metadata',
  'local_media_incomplete',
  'local_media_unavailable',
  'source_file_unavailable',
  'timeout',
  'torrent_closed',
  'torrent_not_ready',
  'unknown_source',
  'scrape_timeout',
  'scrape_unavailable',
  'invalid_hash',
] satisfies Array<MediaLoadError | 'invalid_hash' | 'scrape_timeout' | 'scrape_unavailable'>);

const toEngineError = (error: unknown): unknown =>
  error instanceof ContractError && ENGINE_ERRORS.has(error.code)
    ? new ErrorWithStatus(error.message, error.code)
    : error;

const isUnknownSource = (error: unknown) =>
  error instanceof ContractError && error.code === 'unknown_source';

/** What the service needs to fetch a source. */
export const sourceDescriptor = (source: ContentSource): SourceDescriptor => ({
  id: source.id,
  hash: source.hash,
  magnetLink: source.magnetLink,
  size: Number(source.size) || 0,
  ...(source.file?.length ? { file: Buffer.from(source.file).toString('base64') } : {}),
});

/** Hands the backend's recorded storage to the service; see `setStorageHandoff`. */
export type StorageHandoff = (client: MediaLoadClientService) => Promise<void>;

/** The same legacy data cannot be sent again until the operator addresses the reported issue. */
export class StorageHandoffBlockedError extends Error {}

const HANDOFF_RETRY_MS = 30_000;

const targetRef = (target: PlaybackTarget): TargetRef => ({
  sourceId: target.source.id,
  filePath: target.filePath,
  matchKind: target.matchKind,
  ...(target.durationSeconds !== undefined ? { durationSeconds: target.durationSeconds } : {}),
});

/**
 * The torrent engine in the media-load service: downloads, claims, encrypted storage, verified
 * byte ranges and tracker scrapes. Methods keep the names the backend's callers used when the
 * engine ran in process; failures reject with `ErrorWithStatus` carrying the engine's code, and
 * with `ServiceNotConfiguredError` while the service is not ready.
 *
 * Sources are named by id: each one's descriptor (hash, magnet, `.torrent` file) is sent once,
 * and again when the service reports it does not know the source.
 */
export class MediaLoadClientService extends RemoteService<typeof mediaLoad> {
  /** Sources the service has a descriptor for, and whether that descriptor had the file. */
  private readonly described = new Map<number, boolean>();
  /** Sources with an open stream, mirrored from the service for synchronous checks. */
  private activePlayback = new Set<number>();

  constructor(private readonly config: ConfigurationService) {
    super(config, {
      serviceName: 'MEDIA_LOAD',
      urlKey: 'MEDIA_LOAD_SERVICE_URL',
      timeoutKey: 'MEDIA_LOAD_SERVICE_TIMEOUT_MS',
      contract: mediaLoad,
    });
    this.client.playbackChanged.on(({ activeSourceIds }) => this.setPlayback(activeSourceIds), {
      onResync: () => void this.resyncPlayback(),
    });
    // A service that is gone has no open streams.
    this.subscribeStatus(status => {
      if (status.status !== 'ready') this.setPlayback([]);
    });
  }

  /** The service encrypts media and its records with the backend's key; it needs it first. */
  protected override async beforeConfigure(): Promise<void> {
    await this.client.attach({
      securityKey: this.config.getOrThrow('SOURCE_SECURITY_KEY'),
    });
  }

  private handoff: StorageHandoff | null = null;
  private handoffRun: Promise<void> | null = null;
  private handoffRetry: ReturnType<typeof setTimeout> | null = null;
  private handoffQueued = false;
  private stopped = false;
  /** A configuration was accepted (each reconnection delivers it, and runs the handoff, again). */
  private configured = false;

  /**
   * The service reports ready only once the storage the backend recorded is imported. The
   * handoff runs after each accepted configuration (and at once if one already was), and again
   * every 30 seconds while it fails.
   */
  setStorageHandoff(handoff: StorageHandoff): void {
    this.handoff = handoff;
    if (this.configured) this.runHandoff();
  }

  protected override async afterConfigure(): Promise<void> {
    this.configured = true;
    this.runHandoff();
  }

  private runHandoff(): void {
    if (this.stopped || !this.handoff) return;
    if (this.handoffRun) {
      this.handoffQueued = true;
      return;
    }
    if (this.handoffRetry) clearTimeout(this.handoffRetry);
    this.handoffRetry = null;
    const handoff = this.handoff;
    this.handoffRun = Promise.resolve()
      .then(() => {
        if (!this.stopped) return handoff(this);
      })
      .catch(error => {
        if (this.stopped) return;
        if (error instanceof StorageHandoffBlockedError) {
          logger.error('MediaLoad', error.message);
          return;
        }
        if (this.handoffQueued) return;
        logger.warn('MediaLoad', 'Storage handoff failed; retrying in 30 seconds', error);
        this.handoffRetry = setTimeout(() => this.runHandoff(), HANDOFF_RETRY_MS);
        this.handoffRetry.unref?.();
      })
      .finally(() => {
        this.handoffRun = null;
        if (this.handoffQueued) {
          this.handoffQueued = false;
          this.runHandoff();
        }
      });
  }

  /** Whether to send records, retry adoption, or leave the completed import alone. */
  importStatus(): Promise<{ imported: boolean; sealed?: boolean }> {
    return this.client.importStatus();
  }

  importStorage(items: ImportedSource[]): Promise<{ imported: number; skipped: number }> {
    return this.client.importStorage({ items });
  }

  async completeImport(): Promise<number> {
    return (await this.client.completeImport()).imported;
  }

  override stop(): void {
    this.stopped = true;
    this.handoffQueued = false;
    if (this.handoffRetry) clearTimeout(this.handoffRetry);
    this.handoffRetry = null;
    super.stop();
  }

  private setPlayback(activeSourceIds: number[]): void {
    this.activePlayback = new Set(activeSourceIds);
  }

  private async resyncPlayback(): Promise<void> {
    try {
      this.setPlayback((await this.client.playbackActivity()).activeSourceIds);
    } catch (error) {
      logger.debug('MediaLoad', 'Could not read the open streams', error);
    }
  }

  private async describe(source: ContentSource, force = false): Promise<void> {
    const hasFile = Boolean(source.file?.length);
    const known = this.described.get(source.id);
    if (!force && known !== undefined && (known || !hasFile)) return;
    await this.client.putSource({ source: sourceDescriptor(source) });
    this.described.set(source.id, hasFile || (!force && Boolean(known)));
  }

  /** Run a call that names `source`, describing it first (and again if the service forgot it). */
  private async withSource<T>(source: ContentSource, run: () => Promise<T>): Promise<T> {
    try {
      await this.describe(source);
      return await run();
    } catch (error) {
      if (!isUnknownSource(error)) throw toEngineError(error);
      try {
        await this.describe(source, true);
        return await run();
      } catch (retryError) {
        throw toEngineError(retryError);
      }
    }
  }

  private async engine<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toEngineError(error);
    }
  }

  /* ---------- tracker scrapes ---------- */

  /**
   * Seeders (`broadcasters`) and leechers (`watchers`) for an info hash. Scrape failures reject
   * with `ErrorWithStatus` carrying the contract code (`scrape_timeout`, `scrape_unavailable`,
   * `invalid_hash`).
   */
  async swarmStats(hash: string): Promise<{ broadcasters: number; watchers: number }> {
    const { complete, incomplete } = await this.engine(() => this.client.swarmStats({ hash }));
    return { broadcasters: complete || 0, watchers: incomplete || 0 };
  }

  /* ---------- downloads ---------- */

  /** A source's `.torrent` file, fetched from the swarm. */
  async getSourceMetadataFile(link: string, hash: string, timeout: number): Promise<Buffer> {
    const { file } = await this.engine(() =>
      this.client.sourceMetadataFile({ link, hash, timeoutMs: timeout })
    );
    return Buffer.from(file, 'base64');
  }

  predownload(target: PlaybackTarget, claim: ClaimRequest): Promise<boolean> {
    return this.withSource(target.source, () =>
      this.client.predownload({ target: targetRef(target), claim })
    );
  }

  isFileComplete(sourceId: number, filePath: string): Promise<boolean> {
    return this.engine(() => this.client.isFileComplete({ sourceId, filePath }));
  }

  resolveLayout(source: ContentSource): Promise<EncryptedStorageLayout> {
    return this.withSource(source, () => this.client.resolveLayout({ sourceId: source.id }));
  }

  getMediaFiles(target: PlaybackTarget): Promise<EncryptedStorageLayout> {
    return this.withSource(target.source, () =>
      this.client.mediaFiles({ target: targetRef(target) })
    );
  }

  prepareSubtitleFiles(target: PlaybackTarget, paths: string[]): Promise<void> {
    return this.withSource(target.source, () =>
      this.client.prepareSubtitleFiles({ target: targetRef(target), paths })
    );
  }

  getPlaybackHealth(sourceId: number, filePath?: string): Promise<PlaybackHealth | null> {
    return this.engine(() =>
      this.client.playbackHealth({ sourceId, ...(filePath !== undefined ? { filePath } : {}) })
    );
  }

  releaseClaims(sourceId: number, ownerKey: string, kind?: ClaimKind): Promise<void> {
    return this.engine(() =>
      this.client.releaseClaims({ sourceId, ownerKey, ...(kind ? { kind } : {}) })
    );
  }

  /* ---------- warmup ---------- */

  /** How much of a video a warmup fetches before it is ready (`PRELOAD_WARM_TARGET`). */
  getWarmupTargetBytes(): number {
    return Number(this.config.getOrThrow('PRELOAD_WARM_TARGET'));
  }

  warmSource(
    target: PlaybackTarget,
    targetBytes: number,
    leaseKey: string,
    startFraction?: number
  ): Promise<WarmupResult> {
    return this.withSource(target.source, () =>
      this.client.warmSource({
        target: targetRef(target),
        targetBytes,
        leaseKey,
        ...(startFraction !== undefined ? { startFraction } : {}),
      })
    );
  }

  pauseSource(sourceId: number): Promise<boolean> {
    return this.engine(() => this.client.pauseSource({ sourceId }));
  }

  promoteSource(target: PlaybackTarget, ownerKey: string): Promise<boolean> {
    return this.withSource(target.source, () =>
      this.client.promoteSource({ target: targetRef(target), ownerKey })
    );
  }

  isRangeVerified(
    sourceId: number,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): Promise<boolean> {
    return this.engine(() =>
      this.client.isRangeVerified({ sourceId, filePath, firstPiece, lastPiece })
    );
  }

  getRangeProgress(
    sourceId: number,
    filePath: string,
    firstPiece: number,
    lastPiece: number
  ): Promise<WarmupRangeProgress> {
    return this.engine(() =>
      this.client.rangeProgress({ sourceId, filePath, firstPiece, lastPiece })
    );
  }

  hasActivePlayback(): boolean {
    return this.activePlayback.size > 0;
  }

  isPlaybackActive(sourceId: number): boolean {
    return this.activePlayback.has(sourceId);
  }

  /* ---------- storage ---------- */

  /** Download state of the stored sources among `sourceIds`; others are omitted. */
  getStorageStates(sourceIds: number[]): Promise<StorageState[]> {
    if (!sourceIds.length) return Promise.resolve([]);
    return this.engine(() => this.client.storageStates({ sourceIds }));
  }

  async getStorageState(sourceId: number): Promise<StorageState | null> {
    return (await this.getStorageStates([sourceId]))[0] ?? null;
  }

  getInventory(): Promise<StorageInventory> {
    return this.engine(() => this.client.storageInventory());
  }

  removeStorageWithResult(sourceId: number): Promise<StorageRemovalResult> {
    return this.engine(() => this.client.removeStorage({ sourceId }));
  }

  /**
   * Hear verified-piece changes of every source; `onResync` runs after a gap in which updates
   * were lost. Returns the unsubscribe function.
   */
  onPieces(listener: (update: PiecesUpdate) => void, onResync: () => void): () => void {
    return this.client.piecesChanged.on(listener, { onResync });
  }

  /** The verified pieces of stored sources (rejects with `unsupported` on a 1.0 service). */
  getStorageBitfields(sourceIds: number[]): Promise<StorageBitfield[]> {
    return this.engine(() => this.client.storageBitfields({ sourceIds }));
  }

  /** Hear each source whose file list becomes known; returns the unsubscribe function. */
  onLayout(listener: (sourceId: number, layout: EncryptedStorageLayout) => void): () => void {
    return this.client.layoutKnown.on(({ sourceId, layout }) => listener(sourceId, layout));
  }

  /* ---------- bytes ---------- */

  /**
   * Verified bytes of a target, honouring `Range`, straight from the service. Playback reads
   * claim the file and count as an open stream; speculative reads (probes) do neither.
   */
  streamFile(target: PlaybackTarget, rangeHeader?: string, speculative = false): Promise<Response> {
    return this.withSource(target.source, () =>
      this.client.read.open(
        { target: targetRef(target), ...(speculative ? { speculative } : {}) },
        { headers: rangeHeader ? { range: rangeHeader } : {} }
      )
    );
  }
}
