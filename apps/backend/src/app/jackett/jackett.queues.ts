import { Global, Injectable, Module } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { jackettJobs, queues, SearchMovieData } from '@miauflix/types';
import { Job, Queue, QueueEvents } from 'bullmq';
import { Movie } from '../database/entities/movie.entity';

@Injectable()
export class JackettQueues {
  private jackettEventsQueue: QueueEvents;
  constructor(
    @InjectQueue(queues.jackett)
    private readonly jackettQueue: Queue<
      SearchMovieData,
      void,
      jackettJobs.searchMovie
    >
  ) {
    // ToDo: Use configuration for redis connection
    this.jackettEventsQueue = new QueueEvents(queues.jackett);
  }

  public async prioritizeTorrentSearch(slug: string, priority: number) {
    const jobId = `search_torrents_${slug}`;
    const job = await this.jackettQueue.getJob(jobId);
    if (job) {
      job.changePriority({ priority });
      return job;
    }
    return false;
  }

  public async requestTorrentSearch(
    movie: Movie,
    index: number,
    priority: number
  ) {
    const jobId = `search_torrents_${movie.slug}`;
    return await this.jackettQueue.add(
      jackettJobs.searchMovie,
      {
        movieId: movie.id,
        index: index,
        params: {
          // q: `${movie.title} (${movie.year})`,
          q: movie.slug,
          year: `${movie.year}`,
          traktid: `${movie.traktId}`,
          imdbid: movie.imdbId,
          tmdbid: `${movie.tmdbId}`,
        },
      },
      {
        jobId,
        priority: priority ?? (index < 10 ? 1000 : 2000),
      }
    );
  }

  public waitForJob(job: Job) {
    return job.waitUntilFinished(this.jackettEventsQueue);
  }
}

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.jackett,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
  ],
  providers: [JackettQueues],
  exports: [JackettQueues],
})
export class JackettQueuesModule {}
