import { Inject, Injectable } from '@nestjs/common';
import { asyncProviders } from '../app.types';
import type {
  WebTorrent,
  Instance,
  TorrentFile,
  NodeServer,
  Torrent,
  TorrentOptions,
} from 'webtorrent';
import { ParsedFile } from 'parse-torrent-file';
import { HttpService } from '@nestjs/axios';
import { ParseTorrentImport } from '../app.async.provider';
import { TorrentData } from './torrent.data';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { MoviesData } from '../movies/movies.data';
import { calculateJobId } from './torrent.utils';
import { JackettQueues } from '../jackett/jackett.queues';
import { TorrentOrchestratorQueues } from './torrent.orchestrator.queues';
import { TorrentQueues } from './torrent.queues';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class TorrentService {
  private client: Instance;
  private webTorrentServer: NodeServer;
  private streams: Record<string, [Torrent, string]> = {};
  constructor(
    private readonly jackettQueuesService: JackettQueues,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues,
    private readonly torrentQueuesService: TorrentQueues,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService,
    private readonly torrentData: TorrentData,
    private readonly moviesData: MoviesData,
    @Inject(asyncProviders.parseTorrent)
    private parseTorrent: ParseTorrentImport,
    @Inject(asyncProviders.webTorrent)
    private WebTorrent: WebTorrent
  ) {
    this.client = new this.WebTorrent({
      maxConns: this.configService.getOrThrow('MAX_CONNS', { infer: true }),
      downloadLimit:
        this.configService.getOrThrow<number>('TORRENT_SPEED', {
          infer: true,
        }) << 20,
      uploadLimit:
        this.configService.getOrThrow<number>('TORRENT_SPEED', {
          infer: true,
        }) << 19,
    });
    this.client.on('torrent', (torrent: Torrent) => {
      console.log('New torrent', torrent.name);
    });
    this.client.on('error', (err) => {
      console.error('WebTorrent error', err);
    });
    this.webTorrentServer = this.client.createServer({}, 'node') as NodeServer;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
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

  public async stopStream(streamKey: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const streamTorrent = this.streams[streamKey];
      console.log('Stopping stream', streamKey);
      if (streamTorrent) {
        this.client
          .get(streamTorrent[0])
          .then((torrent) => {
            if (!torrent) {
              delete this.streams[streamKey];
              return resolve(true);
            }

            console.log('Torrent progress', torrent.progress);
            torrent.destroy(
              {
                destroyStore: torrent.progress < 0.5,
              },
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(true);
                  delete this.streams[streamKey];
                }
              }
            );
          })
          .catch(reject);
      }
      resolve(true);
    });
  }

  private async getTorrent(
    slug: string,
    useHevc: boolean,
    useLowQuality: boolean
  ) {
    const torrentData = await this.torrentData.getTorrentByMovieAndQuality(
      slug,
      useHevc,
      useLowQuality
    );

    if (torrentData) {
      return torrentData;
    }

    // Fallback
    // We assume it has a movie because we are at the streaming point
    const movie = await this.moviesData.findMovie(slug);
    if (!movie.torrentsSearched) {
      console.log('No torrent has been searched, searching...');
      const jackettJob =
        (await this.jackettQueuesService.prioritizeTorrentSearch(slug, 1)) ||
        (await this.jackettQueuesService.requestTorrentSearch(movie, 0, 1));

      console.log('Waiting for search job');
      await this.jackettQueuesService.waitForJob(jackettJob);
      console.log('Search job finished');
    } else {
      // Create torrent orchestrator job
      const requestScanJob =
        await this.torrentOrchestratorQueuesService.requestScanTorrents(
          movie.id,
          0,
          0
        );
      // Wait to know what jobs have been added
      const createdJobs =
        await this.torrentOrchestratorQueuesService.waitForJob(requestScanJob);
      const wantedJob = calculateJobId({
        movieId: movie.id,
        hevc: useHevc,
        highQuality: !useLowQuality,
      });
      // FixMe: Use the same logic as in getTorrentByMovieAndQuality
      // Change priority of the job
      if (createdJobs.includes(wantedJob)) {
        while (true) {
          const job = await this.torrentQueuesService.getJob(wantedJob);
          if (job) {
            await job.changePriority({
              priority: 1,
            });
            break;
          }
          await sleep(100);
        }
      }
    }

    while (true) {
      console.log('Checking again for torrent data');
      const torrentData = await this.torrentData.getTorrentByMovieAndQuality(
        slug,
        useHevc,
        useLowQuality
      );
      if (torrentData) {
        console.log('torrent data found');
        return torrentData;
      }
      await sleep(100);
    }
  }

  public async getStream(
    slug: string,
    useHevc: boolean,
    useLowQuality: boolean
  ): Promise<{ stream: string; streamKey: string }> {
    const streamKey = `${slug}_${useHevc ? 'H' : 'x'}${
      useLowQuality ? 'L' : 'x'
    }`;
    if (this.streams[streamKey]) {
      return {
        stream: this.streams[streamKey][1],
        streamKey,
      };
    }
    console.log('Searching DB');
    const { data: torrentFile, videos } = await this.getTorrent(
      slug,
      useHevc,
      useLowQuality
    );
    console.log('Got torrent from DB');
    const bitfieldBuffer = await this.cacheManager.get<string>(
      `torrent:${streamKey}:bitfield`
    );
    return new Promise((resolve, reject) => {
      this.client.add(
        torrentFile,
        {
          path: '/tmp',
          deselect: true,
          skipVerify: false,
          bitfield: bitfieldBuffer
            ? Buffer.from(bitfieldBuffer, 'base64')
            : undefined,
        } as unknown as TorrentOptions,
        (torrent) => {
          const videoFiles = torrent.files.filter((file) =>
            videos.includes(file.name)
          );
          if (videoFiles.length === 0) {
            reject(new Error('No video file found'));
            torrent.destroy({
              destroyStore: true,
            });
          } else {
            console.log('Torrent progress', torrent.progress);
            const file = videoFiles[0];
            file.select();
            file.on('error', (err) => {
              console.error('File error', err);
            });
            const streamURL = `http://localhost:${
              this.webTorrentServer.address().port
            }${file.streamURL}`;
            this.streams[streamKey] = [torrent, streamURL];
            resolve({ stream: streamURL, streamKey });
          }
          torrent.on('verified', (index) => {
            console.log('Torrent progress', torrent.progress);
            console.log('Verified', index);
            this.cacheManager.set(
              `torrent:${streamKey}:bitfield`,
              Buffer.from(torrent.bitfield.buffer).toString('base64'),
              1000 * 60 * 60 * 24 * 7
            );
          });
        }
      );
    });
  }
}
