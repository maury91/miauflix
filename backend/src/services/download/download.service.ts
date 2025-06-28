import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as BTClient } from 'bittorrent-tracker';
import type IPSet from 'ip-set';
import loadIPSet from 'load-ip-set';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';

import { ENV } from '@constants';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import { enhancedFetch } from '@utils/fetch.util';

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

  private async getTrackers(url: string) {
    try {
      const response = await enhancedFetch(url);

      if (response.status >= 200 && response.status < 300) {
        const data = await response.text();
        if (data) {
          const trackers: string[] = data
            .split('\n')
            .map(line => line.split('#')[0].trim())
            .filter(line => line.trim() !== '');
          return trackers;
        }
      }
    } catch (error) {
      logger.error('DownloadService', 'Error fetching trackers:', error);
    }
    return [];
  }

  private getIpSet(url: string): Promise<IPSet | null> {
    return new Promise(resolve => {
      loadIPSet(
        url,
        {
          'user-agent': 'Miauflix/1.0.0',
        },
        (err, ipSet) => {
          if (err) {
            logger.error('DownloadService', 'Error loading IP set:', err);
            return resolve(null);
          }
          resolve(ipSet);
        }
      );
    });
  }

  private async loadTrackers() {
    const [bestTrackers, blacklistedTrackers] = await Promise.all([
      this.getTrackers(this.bestTrackersDownloadUrl),
      this.getIpSet(this.blacklistedTrackersDownloadUrl),
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
}
