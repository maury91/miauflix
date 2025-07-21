import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as BTClient } from 'bittorrent-tracker';
import { Readable } from 'streamx';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';

import { ENV } from '@constants';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';

import {
  encodeRFC5987,
  getContentType,
  getIpSet,
  getTrackers,
  getVideoFile,
  parseRangeHeader,
} from './download.utils';

export class DownloadService {
  public readonly client: WebTorrent;
  private bestTrackers: string[] = [];
  private readonly ready: Promise<void>;
  private readonly staticTrackers: string[];
  private readonly bestTrackersDownloadUrl: string;
  private readonly blacklistedTrackersDownloadUrl: string;

  constructor() {
    this.staticTrackers = ENV('STATIC_TRACKERS');
    this.bestTrackers = [...new Set([...this.staticTrackers])];
    this.bestTrackersDownloadUrl = ENV('BEST_TRACKERS_DOWNLOAD_URL');
    this.blacklistedTrackersDownloadUrl = ENV('BLACKLISTED_TRACKERS_DOWNLOAD_URL');
    this.client = new WebTorrent({
      maxConns: ENV('CONTENT_CONNECTION_LIMIT'),
      downloadLimit: Number(ENV('CONTENT_DOWNLOAD_LIMIT')),
      uploadLimit: Number(ENV('CONTENT_UPLOAD_LIMIT')),
      dht: ENV('DISABLE_DISCOVERY') ? false : undefined,
      blocklist: [this.blacklistedTrackersDownloadUrl],
    });
    this.client.on('error', (error: Error) => {
      logger.error('DownloadService', 'Error:', error.message, error);
    });
    this.ready = this.loadTrackers();
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
          { deselect: true, destroyStoreOnDestroy: true, skipVerify: true },
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
        announce: this.bestTrackers,
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

  async getTorrent(hash: string): Promise<Torrent> {
    const existingTorrent = await this.client.get(hash);
    if (existingTorrent) {
      return existingTorrent;
    }
    return new Promise((resolve, reject) => {
      const torrent = this.client.add(hash, { destroyStoreOnDestroy: true });
      torrent.on('ready', () => {
        resolve(torrent);
      });
      torrent.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Stream a file from a torrent with range request support
   * Based on WebTorrent server implementation
   */
  async streamFile(
    hash: string,
    rangeHeader?: string
  ): Promise<{
    stream: Readable;
    headers: Record<string, string>;
    status: number;
  }> {
    return new Promise(resolve => {
      const handleRequest = async () => {
        const torrent = await this.getTorrent(hash);
        // Autofind the correct file
        const file = getVideoFile(torrent);
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
