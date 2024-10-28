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
import { TorrentData } from './torrent.data';
import { SourceData } from '../sources/sources.data';
import { MoviesData } from '../movies/movies.data';

@Processor(queues.torrent)
export class TorrentProcessor extends WorkerHost {
  private consecutiveErrors = 0;
  constructor(
    private readonly sourceData: SourceData,
    private readonly movieData: MoviesData,
    private readonly torrentData: TorrentData,
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
    this.worker.concurrency = 16;
  }

  @OnWorkerEvent('error')
  onError(job: Job) {
    console.error(`Error processing job ${job.id}`, job.returnvalue);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    console.error(`Failed processing job ${job.id}`, job.failedReason);
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
    movieId,
    hevc,
    highQuality,
  }: GetTorrentFileData) {
    console.log(
      `Searching for a torrent for movieId: ${movieId}, [high quality: ${highQuality}, hevc: ${hevc}])`
    );
    const torrentCandidates = await this.torrentData.findTorrentToProcess({
      movieId,
      highQuality,
      hevc,
    });
    if (torrentCandidates.length) {
      const { id, url, quality, codec, movie, source, size } =
        torrentCandidates[0];
      const torrent = await this.getTorrentFileByUrl(url);
      if (torrent.files.length) {
        try {
          const videoFiles = torrent.files.filter(
            isValidVideoFile(movie.runtime, quality, codec)
          );

          if (videoFiles.length) {
            await torrentCandidates[0].update({
              // data: torrent.torrentFile,
              processed: true,
            });
            await this.sourceData.createSource({
              data: torrent.torrentFile,
              codec,
              quality,
              source,
              movieId,
              movieSlug: movie.slug,
              videos: videoFiles.map((file) => file.name),
              size,
              originalSource: `torrent::${id}`,
            });
            await this.movieData.setTorrentFound(movieId, id);
            console.log(`Torrent ${id} marked as valid`);
            return;
          }
        } catch (err) {
          console.error('Error processing torrent', err);
          throw err;
        }

        await torrentCandidates[0].update({
          processed: true,
          rejected: true,
        });
        console.error('No video files found in torrent', torrent.files);
        throw new Error('No video files found in torrent');
      } else {
        await torrentCandidates[0].update({
          processed: true,
          rejected: true,
        });
        throw new Error('Torrent contains no files');
      }
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
