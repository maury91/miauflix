import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import {
  GetTorrentFileData,
  jackettJobs,
  PopulateTorrentQForMovieData,
  queues,
  SearchMovieData,
  torrentJobs,
} from '../../queues';
import { Job, Queue } from 'bullmq';
import { JackettService } from './jackett.service';
import { JackettData } from './jackett.data';
import { MoviesData } from '../movies/movies.data';

const MIN_TORRENTS = 10;

@Processor(queues.jackett)
export class JackettProcessor extends WorkerHost {
  private consecutiveErrors = 0;
  constructor(
    private readonly jackettService: JackettService,
    private readonly jackettData: JackettData,
    private readonly movieData: MoviesData,
    @InjectQueue(queues.jackett)
    private readonly jackettQueue: Queue<
      PopulateTorrentQForMovieData,
      void,
      jackettJobs.populateTorrentQForMovie
    >,
    @InjectQueue(queues.torrent)
    private readonly torrentQueue: Queue<
      GetTorrentFileData,
      void,
      torrentJobs.getTorrentFile
    >
  ) {
    super();
    this.addTorrentsToProcessToQueue();
  }

  @OnWorkerEvent('error')
  onError(job: Job) {
    console.error(`Error processing job ${job.id}`, job.returnvalue);
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    console.error(`Failed processing job ${job.id}`, job.failedReason);
  }

  onApplicationBootstrap() {
    this.worker.concurrency = 2;
  }

  async addTorrentsToProcessToQueue() {
    const torrents = await this.jackettData.getTorrentsToProcess();
    const failedJobs = await this.torrentQueue.getJobs(['failed']);

    await Promise.all(
      failedJobs.map(async (job) => {
        await job.remove();
      })
    );
    await this.torrentQueue.addBulk(
      torrents.map((jobData) => ({
        name: torrentJobs.getTorrentFile,
        data: jobData,
        opts: {
          jobId: `gtf_${jobData.id}`,
        },
      }))
    );
  }

  private async searchTorrentsForMovie({ movieId, params }: SearchMovieData) {
    console.log(`Searching torrents for movie ${params.q}`);
    const trackers = await this.jackettService.getTrackersByCategory('movie');
    let torrentsFound = 0;
    let processTrackers = 0;

    for (const tracker of trackers) {
      try {
        const torrents = await this.jackettService.queryTracker(
          tracker.id,
          'movie',
          params
        );

        if (torrents.length) {
          for (const torrent of torrents) {
            await this.jackettData.createTorrent({
              movieId: movieId,
              title: torrent.title,
              pubDate: torrent.pubDate,
              size: torrent.size,
              url: torrent.url,
              urlType: torrent.urlType,
              tracker: tracker.id,
              seeders: torrent.seeders,
              peers: torrent.peers,
              quality: torrent.quality,
            });
          }

          console.log(
            `Added ${torrents.length} torrents for movie ${params.q}`
          );
          torrentsFound += torrents.length;
          processTrackers += 1;

          if (torrentsFound > MIN_TORRENTS) {
            await this.movieData.setTorrentSearched(movieId);
            break;
          }
        }
      } catch (error) {
        console.error('Failed to query tracker', tracker, error);
      }
    }
    console.log(
      `Processed movie ${params.q}, searched on ${processTrackers} ( of ${trackers.length}) trackers, found ${torrentsFound} torrents`
    );
    if (torrentsFound === 0) {
      await this.movieData.setNoTorrentFound(movieId);
    } else {
      await this.jackettQueue.add(
        jackettJobs.populateTorrentQForMovie,
        {
          movieId,
        },
        {
          jobId: `ptqm_${movieId}`,
          priority: 10,
        }
      );
    }
  }

  private async populateTorrentQForMovie({
    movieId,
  }: PopulateTorrentQForMovieData) {
    const torrents = await this.jackettData.getTorrentsToProcessForMovie(
      movieId
    );
    await this.torrentQueue.addBulk(
      torrents.map((jobData) => ({
        name: torrentJobs.getTorrentFile,
        data: jobData,
        opts: {
          jobId: `gtf_${jobData.id}`,
        },
      }))
    );
  }

  async process(
    job:
      | Job<SearchMovieData, void, jackettJobs.searchMovie>
      | Job<
          PopulateTorrentQForMovieData,
          void,
          jackettJobs.populateTorrentQForMovie
        >
  ) {
    switch (job.name) {
      case jackettJobs.searchMovie:
        return await this.searchTorrentsForMovie(job.data);
      case jackettJobs.populateTorrentQForMovie:
        return await this.populateTorrentQForMovie(job.data);
    }
  }
}
