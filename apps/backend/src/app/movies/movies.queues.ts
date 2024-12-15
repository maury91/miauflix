import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import {
  GetMovieExtendedDataData,
  MediaImages,
  movieJobs,
  queues,
  SearchImagesForMovieData,
} from '@miauflix/types';
import { Job, Queue, QueueEvents } from 'bullmq';
import { MoviesData } from './movies.data';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MoviesQueues {
  private readonly logger = new Logger(MoviesQueues.name);

  private readonly movieEventsQueue: QueueEvents;
  constructor(
    configService: ConfigService,
    @InjectQueue(queues.movie)
    private readonly movieQueue: Queue<
      GetMovieExtendedDataData | SearchImagesForMovieData
    >,
    private readonly movieData: MoviesData
  ) {
    this.movieEventsQueue = new QueueEvents(queues.movie, {
      connection: {
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
      }
    });
    this.startProcessingMoviesWithoutImages();
  }

  @Cron(CronExpression.EVERY_3_HOURS)
  private async startProcessingMoviesWithoutImages() {
    const movies = await this.movieData.findMoviesWithoutImages();
    this.logger.log(`Found ${movies.length} movies without images`);
    for (const movie of movies) {
      this.requestSearchImagesForMovie(movie.slug);
    }
  }

  public async requestSearchImagesForMovie(slug: string) {
    return this.movieQueue.add(movieJobs.searchImagesForMovie, {
      slug,
    });
  }

  public async requestMovieExtendedData(
    slug: string,
    index: number,
    images: MediaImages,
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
