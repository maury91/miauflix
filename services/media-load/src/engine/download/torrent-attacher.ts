import MemoryChunkStore from 'memory-chunk-store';
import type { Torrent, TorrentOptions, WebTorrentOptions } from 'webtorrent';
import WebTorrent from 'webtorrent';

import EncryptedChunkStore, {
  type EncryptedStorageOptions,
} from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import { ErrorWithStatus } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { ContentSource, Storage } from '../../storage/types';
import { getIpSet, getTrackers } from '../download.utils';
import type { EngineConfig } from '../engine-config';
import { fenceTorrent, unfenceTorrent } from '../network-fence';
import { TorrentDiagnostics } from '../torrent-diagnostics';
import { TORRENT_STORE_CACHE_SLOTS, VPN_REQUIRED_MESSAGE } from './constants';
import { storeEncryptionOptions } from './layout';

export interface TorrentAttacherOptions {
  /** DHT bootstrap nodes (`ip:port`); see `resolveDhtBootstrap`. Default: the DHT's own. */
  dhtBootstrap?: string[];
  networkAllowed: boolean;
  /** Stream counts reported with the client diagnostics. */
  streamStats: () => { activeStreams: number; activeSources: number };
  /** A torrent could not be fenced and was removed; seeding must be restored later. */
  onFenceFailure: () => void;
}

/**
 * The WebTorrent client and how torrents get onto it: trackers, the network kill switch, adding
 * a torrent with an encrypted store (one add per info hash at a time), and metadata lookups.
 */
export class TorrentAttacher {
  readonly client: WebTorrent;
  /** Torrent adds in flight, by lower-case info hash; a second start joins the first. */
  private readonly torrentStartPromises = new Map<string, Promise<Torrent>>();
  private bestTrackers: string[] = [];
  private readonly staticTrackers: string[];
  private readonly bestTrackersDownloadUrl: string;
  private readonly blacklistedTrackersDownloadUrl: string;
  /** Whether torrents may reach trackers and peers; see `setNetworkAllowed`. */
  private networkAllowed: boolean;
  private readonly onFenceFailure: () => void;

  constructor(
    private readonly config: EngineConfig,
    { dhtBootstrap, networkAllowed, streamStats, onFenceFailure }: TorrentAttacherOptions
  ) {
    this.networkAllowed = networkAllowed;
    this.onFenceFailure = onFenceFailure;
    this.staticTrackers = config.getOrThrow('STATIC_TRACKERS');
    this.bestTrackers = [...new Set([...this.staticTrackers])];
    this.bestTrackersDownloadUrl = config.getOrThrow('BEST_TRACKERS_DOWNLOAD_URL');
    this.blacklistedTrackersDownloadUrl = config.getOrThrow('BLACKLISTED_TRACKERS_DOWNLOAD_URL');
    const options: WebTorrentOptions = {
      maxConns: config.getOrThrow('CONTENT_CONNECTION_LIMIT'),
      connectionBudget: config.getOrThrow('CONTENT_CONNECTION_BUDGET'),
      downloadLimit: Number(config.getOrThrow('CONTENT_DOWNLOAD_LIMIT')),
      uploadLimit: Number(config.getOrThrow('CONTENT_UPLOAD_LIMIT')),
      // blocklist: [this.blacklistedTrackersDownloadUrl],
    };
    if (config.getOrThrow('DISABLE_DISCOVERY')) {
      options.dht = false;
    } else if (dhtBootstrap?.length) {
      options.dht = { bootstrap: dhtBootstrap };
    }
    // Bun panics inside utp-native's libuv timers (x64 and macOS prebuilds; arm64 has none), so
    // uTP stays off under Bun; TCP and WebRTC peers remain. See plan/utp-dgram.
    if ('Bun' in globalThis) options.utp = false;
    this.client = new WebTorrent(options);
    new TorrentDiagnostics(this.client, () => ({
      ...streamStats(),
      pendingTorrentStarts: this.torrentStartPromises.size,
    }));
    this.client.on('error', (error: Error) => {
      logger.error('DownloadService', 'Error:', error.message, error);
    });
    // A torrent whose add began before the network was blocked is fenced once it is ready.
    this.client.on('torrent', (torrent: Torrent) => {
      if (!this.networkAllowed) this.safeFence(torrent, true);
    });
  }

  get isNetworkAllowed(): boolean {
    return this.networkAllowed;
  }

  /** The attached torrent stored at `location`, if any. */
  torrentAt(location: string | undefined): Torrent | undefined {
    return this.client.torrents.find(item => item.path === location);
  }

  /** Whether a torrent add for this info hash is still in flight. */
  isStarting(infoHash: string): boolean {
    return this.torrentStartPromises.has(infoHash.toLowerCase());
  }

  /**
   * Fence or unfence every torrent. Blocked: they stop reaching trackers and peers, and nothing
   * new is added. Allowed: they reconnect.
   */
  setNetworkAllowed(allowed: boolean): void {
    this.networkAllowed = allowed;
    for (const torrent of this.client.torrents) this.safeFence(torrent, !allowed);
    if (allowed)
      logger.info('DownloadService', 'Connection is protected: torrents are reconnected');
    else logger.warn('DownloadService', 'Connection is not protected: torrents are disconnected');
  }

  /**
   * One torrent failing must not leave the others connected (or disconnected). A torrent that
   * cannot be fenced fails closed: it is removed (its stored files stay) and restored once the
   * network is allowed again.
   */
  private safeFence(torrent: Torrent, fence: boolean): void {
    try {
      if (fence) fenceTorrent(torrent);
      else unfenceTorrent(torrent);
    } catch (error) {
      logger.error('DownloadService', `Could not ${fence ? 'fence' : 'unfence'} torrent`, error);
      if (!fence) return;
      // Completed downloads come back with the restore pass; others with the next request.
      this.onFenceFailure();
      void Promise.resolve()
        .then(() => this.client.remove(torrent, { destroyStore: false }))
        .catch(removeError => {
          logger.error('DownloadService', 'Could not remove an unfenced torrent', removeError);
          // Last resort: close its connections directly, keeping its files.
          try {
            if (!torrent.destroyed) torrent.destroy({ destroyStore: false });
          } catch (destroyError) {
            logger.error('DownloadService', 'Could not destroy an unfenced torrent', destroyError);
          }
        });
    }
  }

  assertNetworkAllowed(): void {
    if (!this.networkAllowed) throw new ErrorWithStatus(VPN_REQUIRED_MESSAGE, 'vpn_required');
  }

  async loadTrackers(): Promise<void> {
    const [bestTrackers, blacklistedTrackers] = await Promise.all([
      getTrackers(this.bestTrackersDownloadUrl),
      getIpSet(this.blacklistedTrackersDownloadUrl),
    ]);

    if (bestTrackers.length) {
      this.bestTrackers = bestTrackers;
    }
    this.bestTrackers = [...new Set([...this.bestTrackers, ...this.staticTrackers])];

    if (blacklistedTrackers) {
      this.client.blocked = blacklistedTrackers;
    }
  }

  generateLink(hash: string, trackers: string[], name = ''): string {
    const allTrackers = [...new Set([...trackers, ...this.bestTrackers])].filter(Boolean);

    const params = new URLSearchParams();

    // Add each tracker as a separate 'tr' parameter for magnet URI compliance
    allTrackers.forEach(tracker => {
      params.append('tr', tracker);
    });

    if (name) {
      params.set('dn', name);
    }

    return `magnet:?xt=urn:btih:${hash}&${params.toString()}`;
  }

  async getSourceMetadataFile(sourceLink: string, hash: string, timeout: number): Promise<Buffer> {
    this.assertNetworkAllowed();
    return new Promise((resolve, rejectRaw) => {
      let settled = false;
      let temporaryTorrent: Torrent | null = null;
      const remove = async () => {
        if (!temporaryTorrent) return;
        try {
          await this.client.remove(temporaryTorrent.infoHash, { destroyStore: true });
        } catch (error) {
          logger.debug('DownloadService', 'Failed to remove a metadata torrent', error);
        }
      };
      /** Stops waiting on a torrent another operation added (it is not ours to remove). */
      let stopWaitingOnExisting = () => {};
      const reject = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        stopWaitingOnExisting();
        void remove().finally(() => rejectRaw(error));
      };
      const timeoutId = setTimeout(() => {
        reject(new ErrorWithStatus(`Timeout after ${timeout} ms while adding file`, 'timeout'));
      }, timeout);

      try {
        const onSourceMetadata = (sourceMetadata: Torrent) => {
          if (settled) return;
          if (!sourceMetadata.torrentFile) {
            return reject(new ErrorWithStatus(`File not found`, 'added_but_no_file'));
          }
          settled = true;
          clearTimeout(timeoutId);
          stopWaitingOnExisting();
          void remove().finally(() => resolve(sourceMetadata.torrentFile!));
        };
        const existingSourceFile = this.client.torrents.find(t => t.infoHash === hash);
        if (existingSourceFile) {
          if (existingSourceFile.torrentFile) {
            onSourceMetadata(existingSourceFile);
            return;
          }
          // Added by another operation and still fetching metadata: wait for it, within `timeout`.
          const onMetadata = () => onSourceMetadata(existingSourceFile);
          const onError = () =>
            reject(new ErrorWithStatus(`Error adding file to client`, 'add_error'));
          // Removed by its owner before its metadata arrived: it never will.
          const onClose = () =>
            reject(new ErrorWithStatus(`Torrent was removed while adding file`, 'add_error'));
          stopWaitingOnExisting = () => {
            existingSourceFile.off('metadata', onMetadata);
            existingSourceFile.off('error', onError);
            existingSourceFile.off('close', onClose);
          };
          existingSourceFile.once('metadata', onMetadata);
          existingSourceFile.once('error', onError);
          existingSourceFile.once('close', onClose);
          return;
        }
        temporaryTorrent = this.client.add(
          sourceLink,
          {
            deselect: true,
            destroyStoreOnDestroy: true,
            skipVerify: true,
            store: MemoryChunkStore,
          },
          torrent => {
            temporaryTorrent ??= torrent;
            onSourceMetadata(torrent);
          }
        );
      } catch (error: unknown) {
        logger.error('DownloadService', 'Error adding data source', error);
        reject(new ErrorWithStatus(`Error adding file to client`, 'add_error'));
      }
    });
  }

  /**
   * Add torrent with priority-specific configuration and encrypted chunk store
   */
  async addTorrent(
    { magnetLink, hash, file }: Pick<ContentSource, 'file' | 'hash' | 'magnetLink'>,
    storage: Pick<Storage, 'downloadedPieces' | 'encryptedLayout' | 'location'>,
    priority = 1,
    timeout: number = 30000
  ): Promise<Torrent> {
    const { location, downloadedPieces } = storage;
    return new Promise((resolve, reject) => {
      try {
        // Also covers a torrent already in the client: it is fenced, so it would never progress.
        this.assertNetworkAllowed();
        const torrentOptions: TorrentOptions<EncryptedStorageOptions> = {
          path: location,
          deselect: true,
          store: EncryptedChunkStore,
          storeCacheSlots: TORRENT_STORE_CACHE_SLOTS,
          announce: this.bestTrackers,
          priority,
          storeOpts: {
            encryptionKey: this.config.getOrThrow('SOURCE_SECURITY_KEY'),
            ...storeEncryptionOptions(storage, hash),
            padFiles: this.config.getOrThrow('STORAGE_PAD_FILE_SIZES'),
          },
        };

        if (downloadedPieces) {
          torrentOptions.bitfield = downloadedPieces;
        }

        const existingTorrent = this.client.torrents.find(
          t => t.infoHash?.toLowerCase() === hash.toLowerCase()
        );
        if (existingTorrent) {
          void this.waitForTorrentReady(existingTorrent, timeout).then(resolve, reject);
          return;
        }

        // The ready callback, the error handler and the timeout race: the first one settles.
        let settled = false;
        let temporaryTorrent: Torrent | null = null;
        const settle = () => {
          if (settled) return false;
          settled = true;
          clearTimeout(timeoutId);
          temporaryTorrent?.off('error', onError);
          return true;
        };
        const timeoutId = setTimeout(() => {
          if (!settle()) return;
          // Without this the torrent would stay in the client, connected, after its caller failed.
          // The store is kept: it holds the data already downloaded to this location.
          reject(new ErrorWithStatus('Timeout adding download', 'add_torrent_timeout'));
          const added = temporaryTorrent;
          if (added && !added.destroyed) {
            void Promise.resolve()
              .then(() => this.client.remove(added, { destroyStore: false }))
              .catch(error => {
                logger.debug('DownloadService', 'Failed to remove a timed out torrent', error);
              });
          }
        }, timeout);

        const onError = (error: Error) => {
          // Torrent always gets destroyed on error, no need to listen further
          if (!settle()) return;
          if (
            'message' in error &&
            error.message.toLowerCase() === `cannot add duplicate torrent ${hash}`.toLowerCase()
          ) {
            // Search again, maybe some race condition happened
            const existingTorrent = this.client.torrents.find(
              t => t.infoHash?.toLowerCase() === hash.toLowerCase()
            );
            if (existingTorrent) {
              void this.waitForTorrentReady(existingTorrent, timeout).then(resolve, reject);
              return;
            }
          }
          logger.error('DownloadService', 'Error adding torrent:', error);
          reject(error);
        };

        try {
          temporaryTorrent = this.client.add(
            file || magnetLink || hash,
            torrentOptions,
            torrent => {
              if (settle()) resolve(torrent);
            }
          );
          temporaryTorrent.on('error', onError);
        } catch (error) {
          settle();
          // The only case I could find where it throws here is when the client is destroyed
          logger.error('DownloadService', 'Error adding torrent:', error);
          reject(error);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Add a torrent, or join the add already in flight for its info hash. */
  async addTorrentWithLock(
    source: Pick<ContentSource, 'file' | 'hash' | 'magnetLink'>,
    storage: Pick<Storage, 'downloadedPieces' | 'encryptedLayout' | 'location'>,
    priority = 1
  ): Promise<Torrent> {
    const key = source.hash.toLowerCase();
    const inFlight = this.torrentStartPromises.get(key);
    if (inFlight) {
      // A playback joining a background start must not wait for metadata at background priority.
      const pending = this.client.torrents.find(item => item.infoHash?.toLowerCase() === key);
      if (pending && (pending.priority ?? 1) < priority) pending.setPriority?.(priority);
      return inFlight;
    }

    const start = this.addTorrent(source, storage, priority).finally(() => {
      if (this.torrentStartPromises.get(key) === start) {
        this.torrentStartPromises.delete(key);
      }
    });
    this.torrentStartPromises.set(key, start);
    return start;
  }

  private waitForTorrentReady(torrent: Torrent, timeout: number): Promise<Torrent> {
    if (torrent.ready) return Promise.resolve(torrent);

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        torrent.removeListener('ready', onReady);
        torrent.removeListener('error', onError);
        torrent.removeListener('close', onClose);
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onReady = () => {
        finish(() => resolve(torrent));
      };
      const onError = (error: Error) => {
        finish(() => reject(error));
      };
      const onClose = () => {
        finish(() =>
          reject(new ErrorWithStatus('Torrent closed before metadata was ready', 'torrent_closed'))
        );
      };
      const timeoutId = setTimeout(() => {
        finish(() =>
          reject(new ErrorWithStatus('Timeout waiting for torrent metadata', 'torrent_not_ready'))
        );
      }, timeout);
      torrent.once('ready', onReady);
      torrent.once('error', onError);
      torrent.once('close', onClose);
    });
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client.destroy(error => (error ? reject(error) : resolve()));
    });
  }
}
