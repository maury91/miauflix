import { Inject, Injectable } from '@nestjs/common';
import { asyncProviders } from '../app.types';
import {
  WebTorrent,
  Instance,
  TorrentFile,
  NodeServer,
  Torrent,
} from 'webtorrent';
import { ParsedFile } from 'parse-torrent-file';
import { HttpService } from '@nestjs/axios';
import { ParseTorrentImport } from '../app.async.provider';
import { VideoQuality } from '@miauflix/types';
import { TorrentData } from './torrent.data';
import { isValidVideoFile } from './torrent.utils';

@Injectable()
export class TorrentService {
  private client: Instance;
  private webTorrentServer: NodeServer;
  private streams: Record<string, [Torrent, string]> = {};
  constructor(
    private readonly httpService: HttpService,
    private readonly torrentData: TorrentData,
    @Inject(asyncProviders.parseTorrent)
    private parseTorrent: ParseTorrentImport,
    @Inject(asyncProviders.webTorrent)
    private WebTorrent: WebTorrent
  ) {
    this.client = new this.WebTorrent();
    console.log(this.client.torrents);
    this.client.on('torrent', (torrent: Torrent) => {
      console.log('New torrent', torrent.name);
    });
    this.client.on('error', (err) => {
      console.error('WebTorrent error', err);
    });
    this.webTorrentServer = this.client.createServer({}, 'node') as NodeServer;
    // @ts-ignore
    this.webTorrentServer.listen(818, () => {
      console.log(
        'WebTorrent server listening',
        this.webTorrentServer.address()
      );
    });
  }

  private async getTorrentOrMagnet(url: string): Promise<Buffer | string> {
    const { data } = await this.httpService.axiosRef
      .get(url, {
        responseType: 'arraybuffer',
      })
      .catch((err) => {
        if (
          'request' in err &&
          '_options' in err.request &&
          'href' in err.request._options
        ) {
          if (err.request._options.href.startsWith('magnet')) {
            console.log('magnet redirect detected');
            return {
              data: err.request._options.href,
            };
          }
        }
        throw err;
      });
    return data;
  }

  private getTorrentInformation(data: Buffer | string): Promise<{
    files: TorrentFile[] | ParsedFile[];
    torrentFile: Buffer;
  }> {
    return new Promise((resolve, reject) => {
      if (typeof data === 'string' && data.startsWith('magnet')) {
        try {
          this.client.add(data, { deselect: true }, (torrent) => {
            resolve({
              files: torrent.files,
              torrentFile: Buffer.from(torrent.torrentFile),
            });
            try {
              torrent.destroy({
                destroyStore: true,
              });
            } catch (err) {
              console.error('error destroying torrent', err);
              reject(err);
            }
          });
        } catch (err) {
          reject(err);
        }
      } else {
        this.parseTorrent.remote(data, async (err, torrent) => {
          if (err || !torrent) {
            console.error(err);
            reject(err);
          } else {
            resolve({
              files: torrent.files,
              torrentFile: Buffer.from(
                this.parseTorrent.toTorrentFile(torrent)
              ),
            });
          }
        });
      }
    });
  }

  // @Cacheable(24 * 60 * 60 * 1000 /* 1 day */)
  public async downloadByUrl(url: string): Promise<{
    files: TorrentFile[] | ParsedFile[];
    torrentFile: Buffer;
  }> {
    const data = url.startsWith('http')
      ? await this.getTorrentOrMagnet(url)
      : url;
    return this.getTorrentInformation(data);
  }

  public async stopStream(
    slug: string,
    quality: VideoQuality
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const streamTorrent = this.streams[`${slug}/${quality}`];
      if (streamTorrent) {
        this.client.remove(
          streamTorrent[0],
          {
            destroyStore: true,
          },
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(true);
              delete this.streams[`${slug}/${quality}`];
            }
          }
        );
      }
    });
  }

  // ToDo: Implement getStream by codec
  public async getStream(slug: string, quality: VideoQuality): Promise<string> {
    console.log(this.streams);
    if (this.streams[`${slug}/${quality}`]) {
      return this.streams[`${slug}/${quality}`][1];
    }
    console.log('Searching DB');
    const { torrentFile, runtime } =
      await this.torrentData.getTorrentByMovieAndQuality(slug, quality);
    console.log('Got torrent from DB');
    console.log('torrents', this.client.torrents);
    return new Promise((resolve, reject) => {
      this.client.add(
        torrentFile,
        { path: '/tmp', deselect: true, skipVerify: true },
        (torrent) => {
          const videoFiles = torrent.files.filter(
            isValidVideoFile(runtime, quality, 'unknown')
          );
          if (videoFiles.length === 0) {
            reject(new Error('No video file found'));
          } else {
            const file = videoFiles[0];
            file.select();
            const streamURL = `http://localhost:${
              this.webTorrentServer.address().port
            }${file.streamURL}`;
            resolve(streamURL);
            this.streams[`${slug}/${quality}`] = [torrent, streamURL];
          }
        }
      );
    });
  }
}
