import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  jackettJobs,
  queues,
  SearchMovieData,
  torrentOrchestratorJobs,
} from '@miauflix/types';
import { Job } from 'bullmq';
import { JackettService } from './jackett.service';
import { MoviesData } from '../movies/movies.data';
import { TorrentData } from '../torrent/torrent.data';
import { TorrentOrchestratorQueues } from '../torrent/torrent.orchestrator.queues';

const MIN_TORRENTS = 10;

@Processor(queues.jackett)
export class JackettProcessor extends WorkerHost {
  constructor(
    private readonly jackettService: JackettService,
    private readonly torrentData: TorrentData,
    private readonly movieData: MoviesData,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues
  ) {
    super();
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
    this.worker.concurrency = 5;
  }

  private async searchTorrentsForMovie({
    index,
    movieId,
    params,
  }: SearchMovieData) {
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
            await this.torrentData.createTorrent({
              movieId,
              title: torrent.title,
              pubDate: torrent.pubDate,
              size: torrent.size,
              url: torrent.url,
              urlType: torrent.urlType,
              tracker: tracker.id,
              seeders: torrent.seeders,
              codec: torrent.codec,
              source: torrent.source,
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
      await this.movieData.setnoSourceFound(movieId);
    } else {
      await this.torrentOrchestratorQueuesService.requestScanTorrents(
        movieId,
        index
      );
    }
  }

  async process(job: Job<SearchMovieData, void, jackettJobs.searchMovie>) {
    switch (job.name) {
      case jackettJobs.searchMovie:
        return await this.searchTorrentsForMovie(job.data);
    }
  }
}
