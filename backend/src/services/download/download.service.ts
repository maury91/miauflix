import { logger } from '@logger';
import type { ScrapeData } from 'bittorrent-tracker';
import { Client as TrackerClient } from 'bittorrent-tracker';
import type IPSet from 'ip-set';
import loadIPSet from 'load-ip-set';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';

import { ENV } from '@constants';
import { ErrorWithStatus } from '@services/source/services/error-with-status.util';
import {
  bestTrackersURL,
  blacklistedTrackersURL,
  extra_trackers,
} from '@services/source/trackers.const';
import { enhancedFetch } from '@utils/fetch.util';

export class DownloadService {
  public readonly client: WebTorrent;
  private bestTrackers: string[] = [];
  private bestTrackersOriginal: string[] = ['udp://tracker.opentrackr.org:1337'];
  private readonly ready: Promise<void>;

  constructor() {
    this.client = new WebTorrent({
      maxConns: ENV('CONTENT_CONNECTION_LIMIT'),
      downloadLimit: Number(ENV('CONTENT_DOWNLOAD_LIMIT')),
      uploadLimit: Number(ENV('CONTENT_UPLOAD_LIMIT')),
      dht: ENV('DISABLE_DISCOVERY') ? false : undefined,
      blocklist: [blacklistedTrackersURL],
    });
    this.client.on('error', (error: Error) => {
      logger.error('DataService', 'Error:', error.message);
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
      logger.error('DataService', 'Error fetching trackers:', error);
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
            logger.error('DataService', 'Error loading IP set:', err);
            return resolve(null);
          }
          resolve(ipSet);
        }
      );
    });
  }

  private async loadTrackers() {
    const [bestTrackers, blacklistedTrackers] = await Promise.all([
      this.getTrackers(bestTrackersURL),
      this.getIpSet(blacklistedTrackersURL),
    ]);

    if (bestTrackers.length) {
      this.bestTrackers = bestTrackers;
      this.bestTrackersOriginal = [...bestTrackers];
    }
    this.bestTrackers = [...new Set([...this.bestTrackers, ...extra_trackers])];

    if (blacklistedTrackers) {
      this.client.blocked = blacklistedTrackers;
    }
  }

  generateLink(infoHash: string, trackers: string[], name = ''): string {
    const allTrackers = [...new Set([...trackers, ...this.bestTrackers])].filter(Boolean);

    const magnetParams = new URLSearchParams({
      xt: `urn:btih:${infoHash}`,
      tr: allTrackers,
      dn: name,
    });

    return `magnet:?${magnetParams.toString()}`;
  }

  async getTorrent(magnetLink: string, hash: string, timeout: number): Promise<Buffer> {
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
        const onTorrent = (torrent: Torrent) => {
          if (!torrent.torrentFile) {
            return reject(new ErrorWithStatus(`File not found`, 'added_but_no_file'));
          }
          clearTimeout(timeoutId);
          remove();
          resolve(torrent.torrentFile);
        };
        const existingTorrent = this.client.torrents.find(t => t.infoHash === hash);
        if (existingTorrent) {
          onTorrent(existingTorrent);
        }
        this.client.add(
          magnetLink,
          { deselect: true, destroyStoreOnDestroy: true, skipVerify: true },
          onTorrent
        );
      } catch (error: unknown) {
        console.error(`Error adding data source`, error);
        reject(new ErrorWithStatus(`Error adding file to client`, 'add_error'));
      }
    });
  }

  private async scrape(infoHash: string): Promise<ScrapeData> {
    return new Promise((resolve, reject) => {
      const client = new TrackerClient({
        infoHash: infoHash.toLowerCase(),
        announce: this.bestTrackersOriginal,
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

  async getStats(infoHash: string): Promise<{ seeders: number; leechers: number }> {
    await this.ready;
    const result = await this.scrape(infoHash);
    return {
      seeders: result.complete || 0,
      leechers: result.incomplete || 0,
    };
  }
}
