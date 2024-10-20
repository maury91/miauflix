import { Inject, Injectable } from '@nestjs/common';
import { asyncProviders } from '../app.types';
import { WebTorrent, Instance, TorrentFile, NodeServer } from 'webtorrent';
import { ParsedFile } from 'parse-torrent-file';
import { HttpService } from '@nestjs/axios';
import { ParseTorrentImport } from '../app.async.provider';
import { VideoQuality } from '../jackett/jackett.types';
import { TorrentData } from './torrent.data';
import { isValidVideoFile } from './torrent.utils';

@Injectable()
export class TorrentService {
  private client: Instance;
  private webTorrentServer: NodeServer;
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
            console.log(torrent);
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

  public async getStream(slug: string, quality: VideoQuality) {
    const { torrentFile, runtime } =
      await this.torrentData.getTorrentByMovieAndQuality(slug, quality);
    return new Promise((resolve, reject) => {
      this.client.add(
        torrentFile,
        { path: '/tmp', deselect: true },
        (torrent) => {
          const videoFiles = torrent.files.filter(
            isValidVideoFile(runtime, quality)
          );
          if (videoFiles.length === 0) {
            reject(new Error('No video file found'));
          } else {
            const file = videoFiles[0];
            file.select();
            resolve(
              `http://localhost:${this.webTorrentServer.address().port}${
                file.streamURL
              }`
            );
          }
        }
      );
    });
  }
}
