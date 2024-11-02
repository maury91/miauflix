import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  GetMovieExtendedDataData,
  MovieImages,
  movieJobs,
  queues,
} from '@miauflix/types';
import { Job, Queue, QueueEvents } from 'bullmq';

@Injectable()
export class MoviesQueues {
  private movieEventsQueue: QueueEvents;
  constructor(
    @InjectQueue(queues.movie)
    private readonly movieQueue: Queue<GetMovieExtendedDataData>
  ) {
    // ToDo: Use configuration for redis connection
    this.movieEventsQueue = new QueueEvents(queues.movie);
  }

  public async requestMovieExtendedData(
    slug: string,
    index: number,
    images: MovieImages,
    priority = 10000 + index
  ) {
    const jobId = `get_extended_data_${slug}`;
    const existingJob = await this.movieQueue.getJob(jobId);
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
    return this.movieQueue.add(
      movieJobs.getMovieExtendedData,
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
    return job.waitUntilFinished(this.movieEventsQueue);
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.movie,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
  ],
  providers: [MoviesQueues],
  exports: [MoviesQueues],
})
export class MoviesQueuesModule {}
