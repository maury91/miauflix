import { join } from 'node:path';

import type {
  EncryptedStorageLayout,
  ImportedSource,
  PiecesUpdate,
  SourceDescriptor,
  StorageBitfield,
  StorageInventory,
  StorageState,
  TargetRef,
} from '@miauflix/service-contracts';

import { MediaLoadDatabase, openDatabase } from './db/database';
import { resolveDhtBootstrap } from './engine/dht-bootstrap';
import { DownloadService } from './engine/download.service';
import {
  engineConfig,
  type EngineSettings,
  InvalidSettingsError,
  parseEngineSettings,
} from './engine/engine-config';
import { TransferStats } from './engine/transfer-stats';
import { Encryption } from './lib/encryption';
import { ErrorWithStatus } from './lib/errors';
import { logger } from './lib/logger';
import { RemuxService } from './remux/remux.service';
import { encodeBitfield, PieceUpdates } from './storage/piece-updates';
import { StorageService } from './storage/storage.service';
import { StorageImporter } from './storage/storage-import';
import type { ContentSource, PlaybackTarget } from './storage/types';

/** Settings read once, when the WebTorrent client is created; changing them needs a restart. */
const RESTART_KEYS = [
  'CONTENT_CONNECTION_LIMIT',
  'CONTENT_CONNECTION_BUDGET',
  'DISABLE_DISCOVERY',
  'STATIC_TRACKERS',
  'BEST_TRACKERS_DOWNLOAD_URL',
  'BLACKLISTED_TRACKERS_DOWNLOAD_URL',
] as const satisfies ReadonlyArray<keyof EngineSettings>;

export interface Engine {
  database: MediaLoadDatabase;
  storage: StorageService;
  downloads: DownloadService;
  transfers: TransferStats;
  pieces: PieceUpdates;
  remux: RemuxService;
}

/**
 * The engine's lifecycle: it starts once the host has sent both the key (`attach`) and the
 * settings (`applyConfig`), and later settings apply in place.
 */
export class MediaLoadRuntime {
  private securityKey: string | null = null;
  private settings: EngineSettings | null = null;
  private engine: Engine | null = null;
  /** Whether the backend's storage import finished (read when the engine starts). */
  private imported = false;
  private importCompletion: Promise<{ imported: number }> | null = null;
  private readonly startListeners = new Set<(engine: Engine) => void>();

  constructor(
    private readonly databasePath: string,
    private readonly legacyDownloadPath?: string,
    /** Whether torrents may reach trackers and peers (the VPN check); see `refreshNetwork`. */
    private readonly networkAllowed: () => boolean = () => true
  ) {}

  /** Applies `networkAllowed` to the running engine: blocked, torrents are disconnected. */
  async refreshNetwork(): Promise<void> {
    await this.engine?.downloads.setNetworkAllowed(this.networkAllowed());
  }

  static databasePathFor(dataDir: string): string {
    return dataDir === ':memory:' ? dataDir : join(dataDir, 'media-load.sqlite');
  }

  get started(): boolean {
    return this.engine !== null;
  }

  /** The engine runs and holds the backend's storage: engine calls may be served. */
  get serving(): boolean {
    return this.engine !== null && this.imported;
  }

  get keyMissing(): boolean {
    return this.securityKey === null;
  }

  /** Hear the engine start and the storage import finish; returns the unsubscribe function. */
  onStart(listener: (engine: Engine) => void): () => void {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  /** The host's key. A running engine keeps its key: a different one is refused. */
  attach(securityKey: string): void {
    if (!securityKey) throw new Error('The security key is empty');
    if (this.engine && securityKey !== this.securityKey)
      throw new Error('The engine is running with another security key; restart the service');
    new Encryption(securityKey);
    this.securityKey = securityKey;
  }

  /** Parse settings without applying them. @throws InvalidSettingsError */
  check(values: Record<string, string>): EngineSettings {
    return parseEngineSettings(values, this.securityKey ?? '');
  }

  /** Apply settings, starting the engine the first time. */
  async activate(values: Record<string, string>): Promise<{ restartKeys: string[] }> {
    if (!this.securityKey) throw new Error('Waiting for the host to send the security key');
    const next = parseEngineSettings(values, this.securityKey);
    const previous = this.settings;
    this.settings = next;
    if (!this.engine) {
      try {
        await this.start(next.DISABLE_DISCOVERY ? undefined : await resolveDhtBootstrap());
      } catch (error) {
        this.settings = previous;
        throw error;
      }
      return { restartKeys: [] };
    }
    const restartKeys = previous
      ? RESTART_KEYS.filter(key => String(previous[key]) !== String(next[key]))
      : [];
    if (restartKeys.length)
      logger.warn('MediaLoad', `Restart the service to apply: ${restartKeys.join(', ')}`);
    const { downloads, storage } = this.engine;
    downloads.client.throttleDownload?.(Number(next.CONTENT_DOWNLOAD_LIMIT));
    downloads.client.throttleUpload?.(Number(next.CONTENT_UPLOAD_LIMIT));
    if (previous?.CONTENT_SEED_DURATION_SECONDS !== next.CONTENT_SEED_DURATION_SECONDS) {
      await downloads.rescheduleSeedExpiry();
    }
    await storage.reload();
    return { restartKeys };
  }

  private async start(dhtBootstrap?: string[]): Promise<void> {
    const encryption = new Encryption(this.securityKey!);
    const db = openDatabase(this.databasePath);
    const config = engineConfig(() => this.settings!);
    try {
      const database = new MediaLoadDatabase(db, encryption);
      const { imported } = new StorageImporter(database).status();
      const storage = new StorageService(database, config);
      const pieces = new PieceUpdates(database.getStorageRepository());
      const downloads = new DownloadService(storage, config, dhtBootstrap, {
        networkAllowed: this.networkAllowed(),
      });
      const transfers = new TransferStats(downloads.client, database.getTransferRepository());
      transfers.start();
      const remux = new RemuxService({
        repository: database.getRemuxRepository(),
        encryption,
        storage,
        isFileComplete: (sourceId, filePath) => downloads.isFileComplete(sourceId, filePath),
        readSource: async (sourceId, filePath, range) =>
          downloads.streamFile(
            { source: await this.source(sourceId), filePath, matchKind: 'movie' },
            range,
            true
          ),
        ffmpegPath: process.env.FFMPEG_PATH || undefined,
      });
      this.engine = { database, storage, downloads, transfers, pieces, remux };
      this.imported = imported;
    } catch (error) {
      db.close();
      throw error;
    }
    void this.engine.remux
      .start()
      .catch(error => logger.warn('MediaLoad', 'Remux queue failed to start', error));
    this.notifyStart(this.engine);
  }

  private notifyStart(engine: Engine): void {
    for (const listener of this.startListeners) {
      try {
        listener(engine);
      } catch (error) {
        logger.warn('MediaLoad', 'Engine start listener failed', error);
      }
    }
  }

  /** The running engine. @throws when it has not started (calls are gated on readiness). */
  get running(): Engine {
    if (!this.engine) throw new Error('The media-load engine has not started');
    return this.engine;
  }

  async putSource(descriptor: SourceDescriptor): Promise<void> {
    await this.running.database.getSourceRepository().put({
      id: descriptor.id,
      hash: descriptor.hash,
      magnetLink: descriptor.magnetLink,
      size: descriptor.size || 0,
      ...(descriptor.file ? { file: Buffer.from(descriptor.file, 'base64') } : {}),
    });
  }

  /** @throws ErrorWithStatus `unknown_source` when the host has not sent the descriptor. */
  async source(sourceId: number): Promise<ContentSource> {
    const source = await this.running.database.getSourceRepository().findById(sourceId);
    if (!source)
      throw new ErrorWithStatus(`Source ${sourceId} has not been described`, 'unknown_source');
    return source;
  }

  async target(ref: TargetRef): Promise<PlaybackTarget> {
    return {
      source: await this.source(ref.sourceId),
      filePath: ref.filePath,
      matchKind: ref.matchKind,
      ...(ref.durationSeconds !== undefined ? { durationSeconds: ref.durationSeconds } : {}),
    };
  }

  async resolveLayout(sourceId: number): Promise<EncryptedStorageLayout> {
    return this.running.downloads.resolveLayout(await this.source(sourceId));
  }

  async storageStates(sourceIds: number[]): Promise<StorageState[]> {
    const { storage } = this.running;
    const states: StorageState[] = [];
    for (const sourceId of new Set(sourceIds)) {
      const stored = await storage.getStorageBySource(sourceId);
      if (!stored) continue;
      states.push({
        sourceId,
        verifiedBytes: stored.verifiedBytes,
        allocatedBytes: stored.allocatedBytes,
        downloaded: stored.downloaded,
        videoComplete: Boolean(stored.videoCompletedAt),
        localOnly: stored.localOnly,
      });
    }
    return states;
  }

  async storageBitfields(sourceIds: number[]): Promise<StorageBitfield[]> {
    const { storage } = this.running;
    const bitfields: StorageBitfield[] = [];
    for (const sourceId of new Set(sourceIds)) {
      const stored = await storage.getStorageBySource(sourceId);
      if (!stored) continue;
      bitfields.push({
        sourceId,
        totalPieces: stored.totalPieces,
        bitfield: encodeBitfield({
          totalPieces: stored.totalPieces,
          bitfield: stored.downloadedPieces,
        }),
      });
    }
    return bitfields;
  }

  /** Hear verified-piece changes, of `sourceIds` only when given; returns the unsubscribe function. */
  onPieces(listener: (update: PiecesUpdate) => void, sourceIds?: number[]): () => void {
    const wanted = sourceIds?.length ? new Set(sourceIds) : null;
    return this.running.pieces.subscribe(update => {
      if (!wanted || wanted.has(update.sourceId)) listener(update);
    });
  }

  async inventory(): Promise<StorageInventory> {
    const { storage, downloads, transfers } = this.running;
    const inventory = await storage.getInventory();
    const transfer = transfers.states();
    return {
      ...inventory,
      items: inventory.items.map(item => {
        const activity = downloads.getStorageActivity(item);
        return {
          sourceId: item.sourceId,
          requestedFiles: item.requestedFiles,
          allocatedBytes: item.allocatedBytes,
          reservedBytes: item.reservedBytes,
          downloaded: item.downloaded,
          activeStreams: item.activeStreams,
          activity: activity.activity,
          videoComplete: activity.videoComplete,
          torrentLoaded: activity.torrentLoaded,
          seedEndsAt: activity.seedEndsAt?.toISOString() ?? null,
          transfer: transfer.get(item.sourceId) ?? {
            ...transfers.liveFor(item.sourceId),
            totalDownloaded: 0,
            totalUploaded: 0,
          },
        };
      }),
    };
  }

  importStatus(): { imported: boolean; sealed: boolean } {
    return new StorageImporter(this.running.database).status();
  }

  importStorage(items: ImportedSource[]): Promise<{ imported: number; skipped: number }> {
    const roots = [this.settings!.DOWNLOAD_PATH];
    if (this.legacyDownloadPath) roots.push(this.legacyDownloadPath);
    return new StorageImporter(this.running.database).importItems(items, roots);
  }

  /** Seal the import and share one adoption attempt across overlapping callers. */
  completeImport(): Promise<{ imported: number }> {
    this.importCompletion ??= this.adoptImport(this.running).finally(() => {
      this.importCompletion = null;
    });
    return this.importCompletion;
  }

  private async adoptImport(engine: Engine): Promise<{ imported: number }> {
    const { database, storage, downloads } = engine;
    const importer = new StorageImporter(database);
    if (!this.imported) {
      importer.seal();
      await storage.reload();
      await downloads.adoptStorage();
      const imported = importer.complete();
      this.imported = true;
      logger.info('MediaLoad', `Storage import finished: ${imported} stored source(s)`);
      if (this.engine === engine) this.notifyStart(engine);
      return { imported };
    }
    return { imported: importer.complete() };
  }

  async stop(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    await this.importCompletion?.catch(() => undefined);
    engine.transfers.stop();
    engine.pieces.close();
    await engine.remux.close();
    await engine.downloads.close().catch(error => logger.warn('MediaLoad', 'Close failed', error));
    engine.database.close();
  }
}

export { InvalidSettingsError };
