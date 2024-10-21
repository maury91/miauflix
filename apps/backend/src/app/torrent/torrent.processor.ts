import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { GetTorrentFileData, queues, torrentJobs } from '../../queues';
import { Job, Queue } from 'bullmq';
import { TorrentService } from './torrent.service';
import { isValidVideoFile } from './torrent.utils';
import { JackettData } from '../jackett/jackett.data';
import { MoviesData } from '../movies/movies.data';
import { VideoQuality } from '../jackett/jackett.types';

@Processor(queues.torrent)
export class TorrentProcessor extends WorkerHost {
  private consecutiveErrors = 0;
  constructor(
    private readonly jackettData: JackettData,
    private readonly movieData: MoviesData,
    private readonly torrentService: TorrentService,
    @InjectQueue(queues.torrent)
    private readonly torrentQueue: Queue<
      GetTorrentFileData,
      void,
      torrentJobs.getTorrentFile
    >
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker.concurrency = 5;
  }

  @OnWorkerEvent('error')
  onError(job: Job) {
    console.error(`Error processing job ${job.id}`, job.returnvalue);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    console.error(`Failed processing job ${job.id}`, job.failedReason);
  }

  private async skipRelatedTorrents(movieId: number, quality: VideoQuality) {
    const [, skippedTorrents] = await this.jackettData.skipTorrentsForMovie(
      movieId,
      quality
    );
    const waitingJobs = await this.torrentQueue.getJobs(['waiting']);
    skippedTorrents.forEach((torrent) => {
      console.log(`Removing ${torrent.id}`);
      waitingJobs
        .find((job) => job.data.id === torrent.id)
        ?.remove()
        .catch(() => {
          console.error(`Failed to remove job ${torrent.id}`);
        });
    });
  }

  private async getTorrentFileByUrl(url: string) {
    try {
      const torrentFile = await this.torrentService.downloadByUrl(url);
      this.consecutiveErrors = 0;
      return torrentFile;
    } catch (err) {
      console.error('Failed to download torrent', err, url);
      this.consecutiveErrors += 1;
      throw err;
    } finally {
      await this.worker.rateLimit(this.consecutiveErrors * 3000 + 1);
    }
  }

  private async getTorrentFile({
    id,
    movieId,
    quality,
    runtime,
    url,
  }: GetTorrentFileData) {
    console.log(
      `Getting torrent data for torrent id ${id} (quality: ${quality}, movieId: ${movieId})`
    );
    const torrent = await this.getTorrentFileByUrl(url);
    if (torrent.files.length) {
      try {
        const videoFiles = torrent.files.filter(
          isValidVideoFile(runtime, quality)
        );

        if (videoFiles.length) {
          await this.jackettData.updateTorrentData(id, torrent.torrentFile);
          await this.movieData.setTorrentFound(movieId, id);
          await this.skipRelatedTorrents(movieId, quality);
          console.log(`Torrent ${id} marked as valid`);
          return;
        }
      } catch (err) {
        console.error('Error processing torrent', err);
        throw err;
      }

      console.error('No video files found in torrent', torrent.files);
      throw new Error('No video files found in torrent');
    } else {
      console.error(torrent);
      throw new Error('Torrent contains no files');
    }
  }

  async process(
    job: Job<GetTorrentFileData, void, torrentJobs.getTorrentFile>
  ) {
    switch (job.name) {
      case torrentJobs.getTorrentFile:
        return await this.getTorrentFile(job.data);
    }
  }
}
