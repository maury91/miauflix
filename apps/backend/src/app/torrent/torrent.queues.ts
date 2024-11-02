import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { GetTorrentFileData, queues, torrentJobs } from '@miauflix/types';
import { Queue } from 'bullmq';
import {
  calculateJobId,
  calculatePriority,
  GetTorrentFileDataWithIndex,
} from './torrent.utils';
import { BulkJobOptions } from 'bullmq/dist/esm/interfaces';

@Injectable()
export class TorrentQueues {
  // private eventsQueue: QueueEvents;
  constructor(
    @InjectQueue(queues.torrent)
    private readonly torrentQueue: Queue<
      GetTorrentFileData,
      void,
      torrentJobs.getTorrentFile
    >
  ) {
    // ToDo: Use configuration for redis connection
    // this.eventsQueue = new QueueEvents(queues.torrent);
  }

  public getTorrentFile(
    torrents: GetTorrentFileDataWithIndex[],
    basePriority?: number
  ) {
    return this.torrentQueue.addBulk(
      torrents.map<{
        name: torrentJobs.getTorrentFile;
        data: GetTorrentFileData;
        opts?: BulkJobOptions;
      }>((jobData) => ({
        name: torrentJobs.getTorrentFile,
        data: jobData,
        opts: {
          jobId: calculateJobId(jobData),
          priority: calculatePriority(jobData, basePriority),
        },
      }))
    );
  }

  public async changePriority(
    {
      movieId,
      hevc,
      highQuality,
    }: { movieId: number; hevc: boolean; highQuality: boolean },
    priority: number
  ) {
    const job = await this.torrentQueue.getJob(
      calculateJobId({
        hevc,
        highQuality,
        movieId,
      })
    );
    if (job) {
      job.changePriority({
        priority: calculatePriority(
          {
            hevc,
            highQuality,
            index: 0,
          },
          priority
        ),
      });
    }
  }

  public async clearFailedJobs() {
    const failedJobs = await this.torrentQueue.getJobs(['failed']);

    await Promise.all(
      failedJobs.map(async (job) => {
        await job.remove();
      })
    );
  }

  public getJob(jobId: string) {
    return this.torrentQueue.getJob(jobId);
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.torrent,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 10,
      },
    }),
  ],
  providers: [TorrentQueues],
  exports: [TorrentQueues],
})
export class TorrentQueuesModule {}
