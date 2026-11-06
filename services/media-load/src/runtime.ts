import { join } from 'node:path';

import type {
  EncryptedStorageLayout,
  SourceDescriptor,
  StorageInventory,
  StorageState,
  TargetRef,
} from '@miauflix/service-contracts';

import { MediaLoadDatabase, openDatabase } from './db/database';
import { DownloadService } from './engine/download.service';
import {
  engineConfig,
  type EngineSettings,
  InvalidSettingsError,
  parseEngineSettings,
} from './engine/engine-config';
import { Encryption } from './lib/encryption';
import { ErrorWithStatus } from './lib/errors';
import { logger } from './lib/logger';
import { StorageService } from './storage/storage.service';
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
}

/**
 * The engine's lifecycle: it starts once the host has sent both the key (`attach`) and the
 * settings (`applyConfig`), and later settings apply in place.
 */
export class MediaLoadRuntime {
  private securityKey: string | null = null;
  private settings: EngineSettings | null = null;
  private engine: Engine | null = null;
  private readonly startListeners = new Set<(engine: Engine) => void>();

  constructor(private readonly databasePath: string) {}

  static databasePathFor(dataDir: string): string {
    return dataDir === ':memory:' ? dataDir : join(dataDir, 'media-load.sqlite');
  }

  get started(): boolean {
    return this.engine !== null;
  }

  get keyMissing(): boolean {
    return this.securityKey === null;
  }

  /** Hear the engine start (once per process); returns the unsubscribe function. */
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
        this.start();
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
    await storage.reload();
    return { restartKeys };
  }

  private start(): void {
    const encryption = new Encryption(this.securityKey!);
    const database = new MediaLoadDatabase(openDatabase(this.databasePath), encryption);
    const config = engineConfig(() => this.settings!);
    try {
      const storage = new StorageService(database, config);
      const downloads = new DownloadService(storage, config);
      this.engine = { database, storage, downloads };
    } catch (error) {
      database.close();
      throw error;
    }
    for (const listener of this.startListeners) listener(this.engine);
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

  async inventory(): Promise<StorageInventory> {
    const { storage, downloads } = this.running;
    const inventory = await storage.getInventory();
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
        };
      }),
    };
  }

  async stop(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    await engine.downloads.close().catch(error => logger.warn('MediaLoad', 'Close failed', error));
    engine.database.close();
  }
}

export { InvalidSettingsError };
