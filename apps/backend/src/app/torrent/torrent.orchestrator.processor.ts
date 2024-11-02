import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ChangePriorityForMovieData,
  PopulateTorrentQForMovieData,
  queues,
  torrentOrchestratorJobs,
} from '@miauflix/types';
import { Job } from 'bullmq';
import { TorrentData } from './torrent.data';
import { TorrentQueues } from './torrent.queues';

@Processor(queues.torrentOrchestrator)
export class TorrentOrchestratorProcessor extends WorkerHost {
  constructor(
    private readonly torrentData: TorrentData,
    private readonly torrentQueuesService: TorrentQueues
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

  async addTorrentsToProcessToQueue() {
    const torrents = await this.torrentData.getTorrentsToProcess();
    await this.torrentQueuesService.clearFailedJobs();
    // index is unknown because it's not from a list
    await this.torrentQueuesService.getTorrentFile(
      torrents.map((torrent) => ({ ...torrent, index: 11 }))
    );
  }

  private async populateTorrentQForMovie({
    index,
    movieId,
    priority,
  }: PopulateTorrentQForMovieData) {
    const torrents = await this.torrentData.getTorrentsToProcessForMovie(
      movieId
    );
    const jobs = await this.torrentQueuesService.getTorrentFile(
      torrents.map((torrent) => ({ ...torrent, index })),
      priority
    );
    return jobs.map((job) => job.id);
  }

  private async changePriorityForMovie({
    movieId,
    priority,
  }: ChangePriorityForMovieData) {
    return Promise.all(
      [
        [true, true],
        [true, false],
        [false, true],
        [false, false],
      ].map(async ([hevc, highQuality]) => {
        return this.torrentQueuesService.changePriority(
          {
            hevc,
            highQuality,
            movieId,
          },
          priority
        );
      })
    );
  }

  async process(
    job:
      | Job<
          PopulateTorrentQForMovieData,
          void,
          torrentOrchestratorJobs.populateTorrentQForMovie
        >
      | Job<
          ChangePriorityForMovieData,
          void,
          torrentOrchestratorJobs.changePriorityForMovie
        >
  ) {
    switch (job.name) {
      case torrentOrchestratorJobs.populateTorrentQForMovie:
        return await this.populateTorrentQForMovie(job.data);
      case torrentOrchestratorJobs.changePriorityForMovie:
        return await this.changePriorityForMovie(job.data);
    }
  }
}
