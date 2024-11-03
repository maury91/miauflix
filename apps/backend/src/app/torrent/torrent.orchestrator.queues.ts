import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  ChangePriorityForMovieData,
  PopulateTorrentQForMovieData,
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
      PopulateTorrentQForMovieData | ChangePriorityForMovieData,
      string[] | void,
      | torrentOrchestratorJobs.populateTorrentQForMovie
      | torrentOrchestratorJobs.changePriorityForMovie
    >
  ) {
    // ToDo: Use configuration for redis connection
    this.eventsQueue = new QueueEvents(queues.torrentOrchestrator);
  }

  public async prioritizeScanTorrents(movieId: number, priority: number) {
    return (await this.torrentOrchestratorQueue.add(
      torrentOrchestratorJobs.changePriorityForMovie,
      {
        movieId,
        priority,
      },
      {
        jobId: `change_priority_${movieId}`,
      }
    )) as Job<
      ChangePriorityForMovieData,
      void,
      torrentOrchestratorJobs.changePriorityForMovie
    >;
  }

  public async requestScanTorrents(
    movieId: number,
    index: number,
    priority?: number
  ) {
    return (await this.torrentOrchestratorQueue.add(
      torrentOrchestratorJobs.populateTorrentQForMovie,
      {
        movieId,
        index,
        priority,
      },
      {
        jobId: `populate_torrents_${movieId}`,
      }
    )) as Job<
      PopulateTorrentQForMovieData,
      string[],
      torrentOrchestratorJobs.populateTorrentQForMovie
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
