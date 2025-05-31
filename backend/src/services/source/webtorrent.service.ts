import { logger } from '@logger';
import type IPSet from 'ip-set';
import loadIPSet from 'load-ip-set';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';

import { ENV } from '@constants';

import { enhancedFetch, ErrorWithStatus } from './services/utils';
import { bestTrackersURL, blacklistedTrackersURL, extra_trackers } from './trackers.const';

export class WebTorrentService {
  public readonly client: WebTorrent;
  private bestTrackers: string[] = [];

  constructor() {
    this.client = new WebTorrent({
      maxConns: ENV.number('WEBTORRENT_MAX_CONNS'),
      downloadLimit: ENV.number('WEBTORRENT_DOWNLOAD_LIMIT') << 20, // Convert MB/s to bytes/s
      uploadLimit: ENV.number('WEBTORRENT_UPLOAD_LIMIT') << 20, // Convert MB/s to bytes/s
      blocklist: [blacklistedTrackersURL],
    });
    this.client.on('error', (error: Error) => {
      logger.error('DataService', 'Error:', error.message);
    });
    this.loadTrackers();
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
    }
    this.bestTrackers = [...new Set([...this.bestTrackers, ...extra_trackers])];

    if (blacklistedTrackers) {
      this.client.blocked = blacklistedTrackers;
    }
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
}
