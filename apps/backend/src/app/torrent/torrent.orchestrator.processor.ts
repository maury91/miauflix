import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ChangePriorityForMediaData,
  PopulateTorrentQForMediaData,
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
    console.log(`Adding ${torrents.length} torrents to process`);
    await this.torrentQueuesService.clearFailedJobs();
    // index is unknown because it's not from a list
    await this.torrentQueuesService.getTorrentFile(
      torrents.map((torrent) => ({ ...torrent, index: 11 }))
    );
  }

  private async populateTorrentQForMedia({
    index,
    mediaId,
    mediaType,
    priority,
  }: PopulateTorrentQForMediaData) {
    const torrents = await this.torrentData.getTorrentsToProcessForMedia(
      mediaId,
      mediaType
    );
    const jobs = await this.torrentQueuesService.getTorrentFile(
      torrents.map((torrent) => ({ ...torrent, index })),
      priority
    );
    return jobs.map((job) => job.id);
  }

  private async changePriorityForMedia({
    mediaId,
    mediaType,
    priority,
  }: ChangePriorityForMediaData) {
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
            mediaId,
            mediaType,
          },
          priority
        );
      })
    );
  }

  async process(
    job:
      | Job<
          PopulateTorrentQForMediaData,
          void,
          torrentOrchestratorJobs.populateTorrentQForMedia
        >
      | Job<
          ChangePriorityForMediaData,
          void,
          torrentOrchestratorJobs.changePriorityForMedia
        >
  ) {
    switch (job.name) {
      case torrentOrchestratorJobs.populateTorrentQForMedia:
        return await this.populateTorrentQForMedia(job.data);
      case torrentOrchestratorJobs.changePriorityForMedia:
        return await this.changePriorityForMedia(job.data);
    }
  }
}
