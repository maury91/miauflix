import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as BTClient } from 'bittorrent-tracker';
import { createHash } from 'crypto';
import MemoryChunkStore from 'memory-chunk-store';
import { Readable } from 'streamx';
import type { Torrent, TorrentOptions, WebTorrentOptions } from 'webtorrent';
import WebTorrent from 'webtorrent';

import { ENV } from '@constants';
import type { MovieSource } from '@entities/movie-source.entity';
import type { Storage } from '@entities/storage.entity';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import type { StorageService } from '@services/storage/storage.service';

import type { EncryptedStorageOptions } from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import EncryptedChunkStore from '../../chunk-stores/encrypted-chunk-store/encrypted-chunk-store';
import {
  encodeRFC5987,
  getContentType,
  getIpSet,
  getTrackers,
  getVideoFile,
  parseRangeHeader,
} from './download.utils';

// Types for greedy streaming
// export type DownloadPriority = 'full' | 'partial';

export interface GreedyDownload {
  movieSourceId: number;
  torrent: Torrent;
  storage: Storage;
  // priority: DownloadPriority;
  startTime: Date;
}

export interface DownloadProgress {
  movieSourceId: number;
  progress: number; // Percentage (0-100)
  downloadedBytes: number;
  totalBytes: number;
  downloadSpeed: number; // bytes/second
  isComplete: boolean;
}

export class DownloadService {
  public readonly client: WebTorrent;
  private bestTrackers: string[] = [];
  private readonly ready: Promise<void>;
  private readonly staticTrackers: string[];
  private readonly bestTrackersDownloadUrl: string;
  private readonly blacklistedTrackersDownloadUrl: string;
  private readonly scrapeTrackers: string[];

  constructor(private readonly storageService: StorageService) {
    this.staticTrackers = ENV('STATIC_TRACKERS');
    this.scrapeTrackers = ENV('SCRAPE_TRACKERS');
    this.bestTrackers = [...new Set([...this.staticTrackers])];
    this.bestTrackersDownloadUrl = ENV('BEST_TRACKERS_DOWNLOAD_URL');
    this.blacklistedTrackersDownloadUrl = ENV('BLACKLISTED_TRACKERS_DOWNLOAD_URL');
    const options: WebTorrentOptions = {
      maxConns: ENV('CONTENT_CONNECTION_LIMIT'),
      downloadLimit: Number(ENV('CONTENT_DOWNLOAD_LIMIT')),
      uploadLimit: Number(ENV('CONTENT_UPLOAD_LIMIT')),
      // blocklist: [this.blacklistedTrackersDownloadUrl],
    };
    if (ENV('DISABLE_DISCOVERY')) {
      options.dht = false;
    }
    this.client = new WebTorrent(options);
    this.client.on('error', (error: Error) => {
      logger.error('DownloadService', 'Error:', error.message, error);
    });
    this.ready = this.loadTrackers();

    // Subscribe to storageService 'delete' events
    this.storageService.on('delete', storage => {
      // Get the hash from the associated MovieSource
      const hash = storage.movieSource?.hash;
      if (!hash) {
        logger.warn(
          'DownloadService',
          `No hash found for storage ${storage.id}, cannot remove torrent`
        );
        return;
      }

      const torrent = this.client.get(hash);
      if (torrent) {
        this.client.remove(torrent, { destroyStore: true });
        logger.info('DownloadService', `Removed torrent for deleted storage: ${storage.location}`);
      }
    });
  }

  private async loadTrackers() {
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

    const params = new URLSearchParams({
      tr: allTrackers,
      dn: name,
    });

    return `magnet:?xt=urn:btih:${hash}&${params.toString()}`;
  }

  async getSourceMetadataFile(sourceLink: string, hash: string, timeout: number): Promise<Buffer> {
    return new Promise((resolve, rejectRaw) => {
      const remove = () => {
        this.client.remove(hash, () => {});
      };
      const reject = (error: unknown) => {
        clearTimeout(timeoutId);
        remove();
        rejectRaw(error);
      };
      const timeoutId = setTimeout(() => {
        reject(new ErrorWithStatus(`Timeout after ${timeout} ms while adding file`, 'timeout'));
      }, timeout);

      try {
        const onSourceMetadata = (sourceMetadata: Torrent) => {
          if (!sourceMetadata.torrentFile) {
            return reject(new ErrorWithStatus(`File not found`, 'added_but_no_file'));
          }
          clearTimeout(timeoutId);
          remove();
          resolve(sourceMetadata.torrentFile);
        };
        const existingSourceFile = this.client.torrents.find(t => t.infoHash === hash);
        if (existingSourceFile) {
          onSourceMetadata(existingSourceFile);
        }
        this.client.add(
          sourceLink,
          {
            deselect: true,
            destroyStoreOnDestroy: true,
            skipVerify: true,
            store: MemoryChunkStore,
          },
          onSourceMetadata
        );
      } catch (error: unknown) {
        console.error(`Error adding data source`, error);
        reject(new ErrorWithStatus(`Error adding file to client`, 'add_error'));
      }
    });
  }

  private async scrape(infoHash: string): Promise<ScrapeData> {
    return new Promise((resolve, reject) => {
      const client = new BTClient({
        infoHash: infoHash.toLowerCase(),
        announce: this.scrapeTrackers,
        peerId: Buffer.from('01234567890123456789'), // 20-byte dummy peer ID
        port: 6881, // arbitrary port for scrape
      });

      client.once('scrape', data => {
        resolve(data);
        client.destroy();
      });

      client.once('error', err => {
        reject(err);
        client.destroy();
      });

      client.scrape();

      setTimeout(() => {
        reject(new ErrorWithStatus(`Scrape request timed out for ${infoHash}`, 'scrape_timeout'));
        client.destroy();
      }, 5000); // 5 seconds timeout
    });
  }

  async getStats(infoHash: string): Promise<{ broadcasters: number; watchers: number }> {
    await this.ready;
    const result = await this.scrape(infoHash);
    return {
      broadcasters: result.complete || 0,
      watchers: result.incomplete || 0,
    };
  }

  /**
   * Start greedy download with storage tracking and priority management
   * Implements storage-conscious downloading for hobbyist constraints (150GB total storage)
   */
  async startDownload(source: MovieSource): Promise<GreedyDownload> {
    try {
      logger.info('DownloadService', `Starting download for source ${source.id}`);

      // FixMe: Create or get storage
      // If storage already exists use the bitfield for the torrent
      // Create storage record first
      const storage = await this.storageService.createStorage({
        movieSourceId: source.id,
        location: this.generateStoragePath(source.hash),
        size: source.size || 0,
        downloadedPieces: new Uint8Array(0),
        totalPieces: 0,
      });

      // Add torrent with priority-specific configuration
      const torrent = await this.addTorrent(source, storage);

      // Patch storage with correct totalPieces and size after torrent is ready
      await this.storageService.updateDownloadProgress({
        movieSourceId: source.id,
        downloadedPieces: torrent.bitfield?.buffer || new Uint8Array(0),
        totalPieces: torrent.numPieces,
        size: torrent.length,
      });

      // Set up bitfield tracking
      this.setupBitfieldTracking(torrent, source.id);

      const greedyDownload: GreedyDownload = {
        movieSourceId: source.id,
        torrent,
        storage,
        startTime: new Date(),
      };

      logger.info(
        'DownloadService',
        `Successfully started greedy download for source ${source.id}`
      );
      return greedyDownload;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to start greedy download for source ${source.id}:`,
        error
      );
      throw new ErrorWithStatus(
        `Failed to start greedy download: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'greedy_download_failed'
      );
    }
  }

  /**
   * Generate secure storage path for a torrent hash
   * Uses salted hash to prevent hash exposure in file paths
   */
  private generateStoragePath(hash: string): string {
    const storageDir = ENV('DOWNLOAD_PATH');
    const salt = ENV('DOWNLOAD_SALT');

    // Create a salted hash to prevent hash exposure
    const downloadDir = createHash('sha256')
      .update(hash + salt)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters for shorter paths

    return `${storageDir}/${downloadDir}`;
  }

  /**
   * Add torrent with priority-specific configuration and encrypted chunk store
   */
  private async addTorrent(
    { magnetLink, hash, file }: Pick<MovieSource, 'file' | 'hash' | 'magnetLink'>,
    { location, downloadedPieces }: Storage,
    timeout: number = 30000
  ): Promise<Torrent> {
    return new Promise((resolve, reject) => {
      try {
        const torrentOptions: TorrentOptions<EncryptedStorageOptions> = {
          path: location,
          deselect: true,
          store: EncryptedChunkStore,
          announce: this.bestTrackers,
          storeOpts: {
            encryptionKey: ENV('SOURCE_SECURITY_KEY'),
            filenameSalt: `download-${hash}`,
          },
        };

        if (downloadedPieces) {
          torrentOptions.bitfield = downloadedPieces;
        }

        const existingTorrent = this.client.torrents.find(t => t.infoHash === hash);
        if (existingTorrent) {
          resolve(existingTorrent);
          return;
        }

        const timeoutId = setTimeout(() => {
          reject(new ErrorWithStatus('Timeout adding download', 'add_torrent_timeout'));
        }, timeout);

        try {
          const temporaryTorrent = this.client.add(
            file || magnetLink || hash,
            torrentOptions,
            torrent => {
              clearTimeout(timeoutId);
              temporaryTorrent.off('error', onError);
              resolve(torrent);
            }
          );

          const onError = (error: Error) => {
            // Torrent always gets destroyed on error, no need to listen further
            temporaryTorrent.off('error', onError);
            if ('message' in error && error.message === `Cannot add duplicate torrent ${hash}`) {
              // Search again, maybe some race condition happened
              const existingTorrent = this.client.torrents.find(t => t.infoHash === hash);
              if (existingTorrent) {
                resolve(existingTorrent);
                return;
              }
            }
            logger.error('DownloadService', `Error adding torrent ${hash}:`, error);
            reject(error);
          };

          temporaryTorrent.on('error', onError);
        } catch (error) {
          // The only case I could find where it throws here is when the client is destroyed
          logger.error('DownloadService', `Error adding torrent ${hash}:`, error);
          reject(error);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get download progress for a movie source
   */
  async getDownloadProgress(movieSourceId: number): Promise<DownloadProgress | null> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        return null;
      }

      // Find the associated torrent
      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        return {
          movieSourceId,
          progress: storage.downloaded / 100, // Convert from basis points
          downloadedBytes: 0,
          totalBytes: storage.size,
          downloadSpeed: 0,
          isComplete: storage.downloaded >= 10000,
        };
      }

      return {
        movieSourceId,
        progress: torrent.progress * 100, // Convert to percentage
        downloadedBytes: torrent.downloaded,
        totalBytes: torrent.length,
        downloadSpeed: torrent.downloadSpeed,
        isComplete: torrent.done,
      };
    } catch (error) {
      logger.warn(
        'DownloadService',
        `Failed to get download progress for source ${movieSourceId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Pause download for a movie source
   */
  async pauseDownload(movieSourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${movieSourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${movieSourceId}`);
        return false;
      }

      // Pause by deselecting all files
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => file.deselect());
        logger.info('DownloadService', `Paused download for movie source ${movieSourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to pause download for source ${movieSourceId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Resume download for a movie source
   */
  async resumeDownload(movieSourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${movieSourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (!torrent) {
        logger.warn('DownloadService', `No active torrent found for movie source ${movieSourceId}`);
        return false;
      }

      // Resume by selecting files
      if (torrent.files && torrent.files.length > 0) {
        torrent.files.forEach(file => file.select());
        logger.info('DownloadService', `Resumed download for movie source ${movieSourceId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to resume download for source ${movieSourceId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Remove/cancel download for a movie source
   */
  async cancelDownload(movieSourceId: number): Promise<boolean> {
    try {
      const storage = await this.storageService.getStorageByMovieSource(movieSourceId);
      if (!storage) {
        logger.warn('DownloadService', `No storage found for movie source ${movieSourceId}`);
        return false;
      }

      const torrent = this.client.torrents.find(t => t.path === storage.location);
      if (torrent) {
        this.client.remove(torrent);
        logger.info('DownloadService', `Removed torrent for movie source ${movieSourceId}`);
      }

      // Remove storage record
      await this.storageService.removeStorage(movieSourceId);
      logger.info(
        'DownloadService',
        `Cancelled download and cleaned up storage for movie source ${movieSourceId}`
      );

      return true;
    } catch (error) {
      logger.error(
        'DownloadService',
        `Failed to cancel download for source ${movieSourceId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Set up bitfield tracking for storage service integration
   */
  private setupBitfieldTracking(torrent: Torrent, movieSourceId: number): void {
    torrent.on('verified', async () => {
      try {
        // Convert BitField to Uint8Array for storage service
        const bitfieldBuffer = torrent.bitfield?.buffer
          ? Buffer.from(torrent.bitfield.buffer)
          : new Uint8Array(0);

        await this.storageService.updateDownloadProgress({
          movieSourceId,
          downloadedPieces: new Uint8Array(bitfieldBuffer),
          totalPieces: torrent.numPieces,
          size: torrent.length,
        });
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to update download progress for source ${movieSourceId}:`,
          error
        );
      }
    });

    torrent.on('done', async () => {
      try {
        await this.storageService.markAsAccessed(movieSourceId);
        logger.info('DownloadService', `Download completed for movie source ${movieSourceId}`);
      } catch (error) {
        logger.warn(
          'DownloadService',
          `Failed to mark download as complete for source ${movieSourceId}:`,
          error
        );
      }
    });
  }

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  async streamFile(
    movieSource: MovieSource,
    rangeHeader?: string
  ): Promise<{
    stream: Readable;
    headers: Record<string, string>;
    status: number;
  }> {
    return new Promise(resolve => {
      const handleRequest = async () => {
        const { torrent } = await this.startDownload(movieSource);
        // Autofind the correct file
        const file = getVideoFile(torrent);
        file.select();

        const headers: Record<string, string> = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeRFC5987(file.name)}`,
          'Content-Type': getContentType(file.name),
          Expires: '0',
          'transferMode.dlna.org': 'Streaming',
          'contentFeatures.dlna.org':
            'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000',
          // CORS headers
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
        };
        let status = 200;
        const range = parseRangeHeader(file.length, rangeHeader || '');
        if (range) {
          status = 206;
          headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.length}`;
          headers['Content-Length'] = String(range.end - range.start + 1);
        } else {
          headers['Content-Length'] = String(file.length);
        }
        // Create readable stream from file using WebTorrent's createReadStream
        const iterator = file[Symbol.asyncIterator](range || {});

        const stream = Readable.from(iterator);

        resolve({
          stream,
          headers,
          status,
        });
      };

      if (this.client.ready) {
        handleRequest();
      } else {
        this.client.once('ready', handleRequest);
      }
    });
  }
}
