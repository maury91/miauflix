import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  GetShowExtendedDataData,
  MediaImages,
  showJobs,
  queues,
  SearchImagesForShowData,
} from '@miauflix/types';
import { Job, Queue, QueueEvents } from 'bullmq';
import { ShowsData } from './shows.data';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ShowsQueues {
  private readonly showsEventsQueue: QueueEvents;
  constructor(
    @InjectQueue(queues.show)
    private readonly showQueue: Queue<
      GetShowExtendedDataData | SearchImagesForShowData
    >,
    private readonly showsData: ShowsData
  ) {
    // ToDo: Use configuration for redis connection
    this.showsEventsQueue = new QueueEvents(queues.show);
    this.startProcessingShowsWithoutImages();
  }

  @Cron(CronExpression.EVERY_3_HOURS)
  private async startProcessingShowsWithoutImages() {
    const shows = await this.showsData.findShowsWithoutImages();
    console.log(`Found ${shows.length} shows without images`);
    for (const show of shows) {
      this.requestSearchImagesForShow(show.slug);
    }
  }

  public async requestSearchImagesForShow(slug: string) {
    return this.showQueue.add(showJobs.searchImagesForShow, {
      slug,
    });
  }

  public async requestShowExtendedData(
    slug: string,
    index: number,
    images: MediaImages,
    priority = 10000 + index
  ) {
    const jobId = `get_show_extended_data_${slug}`;
    const existingJob = await this.showQueue.getJob(jobId);
    if (existingJob) {
      // Update priority ( it may have changed to a lower one )
      if (existingJob.priority > priority) {
        // Optimistic change, we don't need to wait for it
        existingJob.changePriority({
          priority,
        });
      }
      return existingJob;
    }
    return this.showQueue.add(
      showJobs.getShowExtendedData,
      {
        slug,
        index,
        images,
        priority: priority < 10000 ? 100 : undefined,
      },
      {
        jobId,
        priority,
      }
    );
  }

  public waitForJob(job: Job) {
    return job.waitUntilFinished(this.showsEventsQueue);
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.show,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
  ],
  providers: [ShowsQueues],
  exports: [ShowsQueues],
})
export class ShowsQueuesModule {}
