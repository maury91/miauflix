import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  ChangePriorityForMediaData,
  PopulateTorrentQForMediaData,
  queues,
  torrentOrchestratorJobs,
} from '@miauflix/types';
import { Job, Queue, QueueEvents } from 'bullmq';

@Injectable()
export class TorrentOrchestratorQueues {
  private eventsQueue: QueueEvents;
  constructor(
    @InjectQueue(queues.torrentOrchestrator)
    private readonly torrentOrchestratorQueue: Queue<
      PopulateTorrentQForMediaData | ChangePriorityForMediaData,
      string[] | void,
      | torrentOrchestratorJobs.populateTorrentQForMedia
      | torrentOrchestratorJobs.changePriorityForMedia
    >
  ) {
    // ToDo: Use configuration for redis connection
    this.eventsQueue = new QueueEvents(queues.torrentOrchestrator);
  }

  public async prioritizeScanTorrents(
    mediaId: number,
    mediaType: 'movie' | 'episode',
    priority: number
  ) {
    return (await this.torrentOrchestratorQueue.add(
      torrentOrchestratorJobs.changePriorityForMedia,
      {
        mediaId,
        mediaType,
        priority,
      } satisfies ChangePriorityForMediaData,
      {
        jobId: `change_priority_${mediaId}_${mediaType}`,
      }
    )) as Job<
      ChangePriorityForMediaData,
      void,
      torrentOrchestratorJobs.changePriorityForMedia
    >;
  }

  public async requestScanMovieTorrents(
    movieId: number,
    index: number,
    priority?: number
  ) {
    return (await this.torrentOrchestratorQueue.add(
      torrentOrchestratorJobs.populateTorrentQForMedia,
      {
        mediaId: movieId,
        mediaType: 'movie',
        index,
        priority,
      } satisfies PopulateTorrentQForMediaData,
      {
        jobId: `populate_torrents_${movieId}`,
      }
    )) as Job<
      PopulateTorrentQForMediaData,
      string[],
      torrentOrchestratorJobs.populateTorrentQForMedia
    >;
  }

  public async requestScanEpisodeTorrents(
    episodeId: number,
    index: number,
    priority?: number
  ) {
    return (await this.torrentOrchestratorQueue.add(
      torrentOrchestratorJobs.populateTorrentQForMedia,
      {
        mediaId: episodeId,
        mediaType: 'episode',
        index,
        priority,
      } satisfies PopulateTorrentQForMediaData,
      {
        jobId: `populate_torrents_${episodeId}`,
      }
    )) as Job<
      PopulateTorrentQForMediaData,
      string[],
      torrentOrchestratorJobs.populateTorrentQForMedia
    >;
  }

  public waitForJob<T>(job: Job<unknown, T>): Promise<T> {
    return job.waitUntilFinished(this.eventsQueue);
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.torrentOrchestrator,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
  ],
  providers: [TorrentOrchestratorQueues],
  exports: [TorrentOrchestratorQueues],
})
export class TorrentOrchestratorQueuesModule {}
