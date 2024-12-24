import { Inject, Injectable, Logger } from '@nestjs/common';
import { asyncProviders } from '../app.types';
import type {
  WebTorrent,
  Instance,
  TorrentFile,
  NodeServer,
  Torrent,
} from 'webtorrent';
import { ParsedFile } from 'parse-torrent-file';
import { HttpService } from '@nestjs/axios';
import ffmpeg from 'fluent-ffmpeg';
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
import path from 'node:path';
import BitField from 'bitfield';
import { ShowsData } from '../shows/shows.data';
import { stat } from 'node:fs/promises';
import { SourceData } from '../sources/sources.data';
import { MovieSource } from '../database/entities/movie.source.entity';
import { EpisodeSource } from '../database/entities/episode.source.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retryPromise = <T>(
  fn: () => Promise<T>,
  retries = 100,
  delay = 3000
): Promise<T> => {
  return fn().catch((err) => {
    if (retries > 0) {
      return sleep(delay).then(() => retryPromise(fn, retries - 1, delay));
    }
    return Promise.reject(err);
  });
};

interface TorrentInfo {
  id: number;
  torrent: Torrent;
  url: string;
  start: number;
  end: number;
  type: 'movie' | 'episode';
  slug: string;
  useHevc: boolean;
  useLowQuality: boolean;
}

const calculateSizeInBytes = (size: string) => {
  const numSize = BigInt(parseInt(size.substring(0, size.length - 2), 10));
  const unit = size.substring(size.length - 2).toUpperCase();
  switch (unit) {
    case 'TB':
      return numSize << BigInt(40);
    case 'GB':
      return numSize << BigInt(30);
    case 'MB':
      return numSize << BigInt(20);
  }
  throw 'Invalid size';
};

@Injectable()
export class TorrentService {
  private client: Instance;
  private webTorrentServer: NodeServer;
  private streams: Record<string, TorrentInfo> = {};
  private readonly logger = new Logger(TorrentService.name);
  private readonly port: number;
  private readonly path: string;
  private readonly maxStorage: bigint;
  constructor(
    private readonly jackettQueuesService: JackettQueues,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues,
    private readonly torrentQueuesService: TorrentQueues,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService,
    private readonly torrentData: TorrentData,
    private readonly moviesData: MoviesData,
    private readonly showsData: ShowsData,
    private readonly sourceData: SourceData,
    @Inject(asyncProviders.parseTorrent)
    private parseTorrent: ParseTorrentImport,
    @Inject(asyncProviders.webTorrent)
    private WebTorrent: WebTorrent
  ) {
    this.port = this.configService.getOrThrow('TORRENT_PORT', { infer: true });
    this.maxStorage = calculateSizeInBytes(
      this.configService.getOrThrow('MAX_STORAGE')
    );
    this.path = this.configService.getOrThrow('STORAGE_PATH');
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
    // this.client.on('torrent', (torrent: Torrent) => { });
    this.client.on('error', (err) => {
      this.logger.error('WebTorrent error', err);
    });
    this.webTorrentServer = this.client.createServer({}, 'node') as NodeServer;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.webTorrentServer.listen(this.port, () => {
      console.log(
        'WebTorrent server listening',
        this.webTorrentServer.address()
      );
    });
  }

  private async deleteSource(
    source: MovieSource | EpisodeSource,
    type: 'movie' | 'episode'
  ) {
    return new Promise((resolve, reject) => {
      console.log('Deleting source', source.id);
      this.client
        .get(source.data)
        .then((torrent) => {
          if (!torrent) {
            this.sourceData.clearSource(type, source.id);
            return resolve(true);
          }

          torrent.destroy(
            {
              destroyStore: true,
            },
            (err) => {
              if (err) {
                reject(err);
              } else {
                console.log('Torrent destroyed');
                this.sourceData.clearSource(type, source.id);
                resolve(true);
              }
            }
          );
        })
        .catch(reject);
    });
  }

  @Cron(CronExpression.EVERY_3_HOURS)
  private async storageCleaning() {
    const sourcesUsingStorage = await this.sourceData.getUsedStorage();
    const totalUsedStorage = sourcesUsingStorage.reduce(
      (acc, source) => acc + BigInt(source.source.size),
      BigInt(0)
    );
    if (totalUsedStorage > this.maxStorage) {
      const sortedSources = sourcesUsingStorage.sort(
        (a, b) => a.source.lastUsedAt.getTime() - b.source.lastUsedAt.getTime()
      );
      let i = 0,
        totalCleaned = BigInt(0);
      while (
        totalUsedStorage - totalCleaned > this.maxStorage &&
        i < sortedSources.length
      ) {
        const source = sortedSources[i];
        await this.deleteSource(source.source, source.type);
        totalCleaned += BigInt(source.source.size);
        i++;
      }
    }
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
            return {
              data: err.request._options.href,
            };
          }
        }
        throw err;
      });
    return data;
  }

  public async *subscribeToProgress(streamKey: string) {
    const streamTorrent = this.streams[streamKey];
    if (streamTorrent) {
      const { torrent, start, end } = streamTorrent;
      let results: number[] = [];
      let resolve: () => void;
      let promise = new Promise<void>((r) => (resolve = r));
      torrent.on('verified', (pieceNumber) => {
        results.push(pieceNumber);
        resolve();
        promise = new Promise((r) => (resolve = r));
      });
      while (true) {
        let isComplete = true;
        for (let i = start; i < end; i++) {
          if (!torrent.bitfield.get(i)) {
            isComplete = false;
            break;
          }
        }
        if (isComplete) {
          break;
        }
        await promise;
        yield* results;
        results = [];
      }
    }
  }

  public async getInfo(streamKey: string) {
    const streamTorrent = this.streams[streamKey];
    if (streamTorrent) {
      const torrent = await this.client.get(streamTorrent.torrent);
      if (torrent) {
        const progress = new BitField(
          streamTorrent.end - streamTorrent.start + 1
        );
        for (let i = streamTorrent.start; i <= streamTorrent.end; i++) {
          progress.set(i, torrent.bitfield.get(i + streamTorrent.start));
        }
        return {
          progress: Buffer.from(progress.buffer),
        };
      }
    }
    throw new Error('Torrent not found');
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
    streamKey: string,
    forceDestroy = false
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const streamTorrent = this.streams[streamKey];
      console.log('Stopping stream', streamKey);
      if (streamTorrent) {
        this.client
          .get(streamTorrent.torrent)
          .then((torrent) => {
            if (!torrent) {
              delete this.streams[streamKey];
              this.cacheManager.del(`torrent:${streamKey}:bitfield`);
              this.sourceData.clearSource(streamTorrent.type, streamTorrent.id);
              return resolve(true);
            }

            const shouldDestroy = torrent.progress < 0.05 || forceDestroy;
            console.log(
              `Torrent ${torrent.name} progress ${Math.round(
                torrent.progress * 100
              )}%`
            );
            torrent.destroy(
              {
                destroyStore: shouldDestroy,
              },
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  console.log(
                    shouldDestroy ? 'Torrent destroyed' : 'Torrent stopped'
                  );
                  if (shouldDestroy) {
                    this.cacheManager.del(`torrent:${streamKey}:bitfield`);
                    this.sourceData.clearSource(
                      streamTorrent.type,
                      streamTorrent.id
                    );
                  }
                  delete this.streams[streamKey];
                  resolve(true);
                }
              }
            );
          })
          .catch(reject);
      }
      resolve(true);
    });
  }

  public async setBroken(streamKey: string) {
    const streamTorrent = this.streams[streamKey];
    console.log('Marking as broken', streamKey, streamTorrent.id);
    await this.torrentData.markTorrentAsBroken(
      streamTorrent.type,
      streamTorrent.id
    );
    await this.stopStream(streamKey, true);
    return this.getStream(
      streamTorrent.type,
      streamTorrent.slug,
      streamTorrent.useHevc,
      streamTorrent.useLowQuality
    );
  }

  private async getVideoInformation(file: TorrentFile) {
    const filePath = path.join(this.path, file.path);
    return new Promise((resolve, reject) => {
      stat(filePath)
        .then(() => {
          try {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
              if (err) {
                reject(err);
              } else {
                console.log(metadata);
                resolve(metadata);
              }
            });
          } catch (err) {
            console.log('Torrent file does not exists yet');
            reject(err);
          }
        })
        .catch(reject);
    });
  }

  private async getMovieTorrent(
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
    if (!movie.sourcesSearched) {
      console.log('No source has been searched, searching...');
      const jackettJob =
        (await this.jackettQueuesService.prioritizeTorrentSearch(slug, 1)) ||
        (await this.jackettQueuesService.requestTorrentMovieSearch(
          movie,
          0,
          1
        ));

      console.log('Waiting for search job');
      await this.jackettQueuesService.waitForJob(jackettJob);
      console.log('Search job finished');
    } else {
      // Create torrent orchestrator job
      const requestScanJob =
        await this.torrentOrchestratorQueuesService.requestScanMovieTorrents(
          movie.id,
          0,
          0
        );
      // Wait to know what jobs have been added
      const createdJobs =
        await this.torrentOrchestratorQueuesService.waitForJob(requestScanJob);
      const wantedJob = calculateJobId({
        mediaId: movie.id,
        mediaType: 'movie',
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

  private async getEpisodeTorrent(
    episodeId: number,
    useHevc: boolean,
    useLowQuality: boolean
  ) {
    const torrentData = await this.torrentData.getTorrentByEpisodeAndQuality(
      episodeId,
      useHevc,
      useLowQuality
    );

    if (torrentData) {
      console.log('torrent data found', torrentData.id);
      return torrentData;
    }
    console.log('No torrent data for episode', episodeId);

    // Fallback
    // We assume it has an episode because we are at the streaming point
    const episode = await this.showsData.findEpisode(episodeId);
    if (!episode.sourcesSearched) {
      console.log('No source has been searched, searching...');
      const season = await this.showsData.findSeason(episode.seasonId);
      const show = await this.showsData.findShowFromDb(season.showId);
      const jackettJob =
        (await this.jackettQueuesService.prioritizeEpisodeTorrentSearch(
          show,
          season,
          episode,
          1
        )) ||
        (await this.jackettQueuesService.requestTorrentEpisodeSearch(
          show,
          season,
          episode,
          1
        ));

      console.log('Waiting for search job');
      await this.jackettQueuesService.waitForJob(jackettJob);
      console.log('Search job finished');
    } else {
      // Create torrent orchestrator job
      const requestScanJob =
        await this.torrentOrchestratorQueuesService.requestScanEpisodeTorrents(
          episode.id,
          0,
          0
        );
      // Wait to know what jobs have been added
      const createdJobs =
        await this.torrentOrchestratorQueuesService.waitForJob(requestScanJob);
      const wantedJob = calculateJobId({
        mediaId: episode.id,
        mediaType: 'movie',
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
      const torrentData = await this.torrentData.getTorrentByEpisodeAndQuality(
        episodeId,
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
    type: 'movie' | 'episode',
    slug: string,
    useHevc: boolean,
    useLowQuality: boolean
  ): Promise<{ stream: string; streamKey: string }> {
    const streamKey = `${type}_${slug}_${useHevc ? 'H' : 'x'}${
      useLowQuality ? 'L' : 'x'
    }`;
    if (this.streams[streamKey]) {
      return {
        stream: this.streams[streamKey].url,
        streamKey,
      };
    }
    console.log('Searching DB for torrent', streamKey);
    const {
      data: torrentFile,
      videos,
      id,
    } = await (type === 'movie'
      ? this.getMovieTorrent(slug, useHevc, useLowQuality)
      : this.getEpisodeTorrent(parseInt(slug, 10), useHevc, useLowQuality));
    console.log('Got torrent from DB', id);
    const bitfieldBuffer = await this.cacheManager.get<string>(
      `torrent:${streamKey}:bitfield`
    );
    return new Promise((resolve, reject) => {
      this.client.add(
        torrentFile,
        {
          path: this.path,
          deselect: true,
          bitfield: bitfieldBuffer
            ? Buffer.from(bitfieldBuffer, 'base64')
            : undefined,
        },
        (torrent) => {
          console.log(torrent.files);
          const videoFiles = torrent.files.filter((file) =>
            videos.includes(file.name)
          );
          if (videoFiles.length === 0) {
            reject(new Error('No video file found'));
            torrent.destroy({
              destroyStore: true,
            });
          } else {
            // Download subtitles files
            for (const file of torrent.files) {
              console.log(file.name);
              if (file.name.endsWith('.srt')) {
                file.select();
              }
            }
            console.log('Torrent progress', torrent.progress);
            const file = videoFiles[0];
            file.select();

            this.sourceData
              .updateSource({
                type,
                id,
                status: torrent.progress === 1 ? 'completed' : 'downloading',
                downloadedPath: torrent.path,
                downloadPercentage: torrent.progress * 100,
              })
              .then(this.storageCleaning.bind(this));

            let start = -1,
              end = -1;
            for (let i = 0; i < torrent.pieces.length; i++) {
              if (file.includes(i)) {
                if (start === -1) {
                  start = i;
                }
                end = i;
              }
            }
            retryPromise(() => this.getVideoInformation(file)).catch((err) => {
              console.error('Could not get video information', err);
            });
            file.on('error', (err) => {
              console.error('File error', err);
            });
            const streamURL = `http://localhost:${
              this.webTorrentServer.address().port
            }${file.streamURL}`;
            this.streams[streamKey] = {
              id,
              torrent,
              url: streamURL,
              start,
              end,
              type,
              slug,
              useHevc,
              useLowQuality,
            };
            resolve({ stream: streamURL, streamKey });
          }
          torrent.on('verified', (index) => {
            console.log(
              `Torrent ${torrent.name} progress ${Math.round(
                torrent.progress * 100
              )}%`
            );
            console.log('Verified', index);
            this.cacheManager.set(
              `torrent:${streamKey}:bitfield`,
              Buffer.from(torrent.bitfield.buffer).toString('base64'),
              1000 * 60 * 60 * 24 * 7
            );

            this.sourceData.updateSource({
              type,
              id,
              status: torrent.progress === 1 ? 'completed' : 'downloading',
              downloadPercentage: torrent.progress * 100,
              downloaded: Buffer.from(torrent.bitfield.buffer),
            });
          });
        }
      );
    });
  }
}
