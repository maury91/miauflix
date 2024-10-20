import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  GetMovieExtendedDataData,
  jackettJobs,
  queues,
  SearchMovieData,
} from '../../queues';
import { Job, Queue } from 'bullmq';
import { MovieProcessorService } from './movies.processor.service';

@Processor(queues.movie)
export class MovieProcessor extends WorkerHost {
  constructor(
    private readonly processor: MovieProcessorService,
    @InjectQueue(queues.jackett)
    private readonly torrentQueue: Queue<
      SearchMovieData,
      void,
      jackettJobs.searchMovie
    >
  ) {
    super();
  }

  onApplicationBootstrap() {
    this.worker.concurrency = 2;
  }

  async process(job: Job<GetMovieExtendedDataData>) {
    // Double check if the movie is in the database
    try {
      const extendedMovie = await this.processor.getMovieExtendedData(
        job.data.slug,
        job.data.images
      );
      if (!extendedMovie.torrentFound) {
        await this.torrentQueue.add(
          jackettJobs.searchMovie,
          {
            movieId: extendedMovie.id,
            params: {
              // q: `${extendedMovie.title} (${extendedMovie.year})`,
              q: extendedMovie.slug,
              year: `${extendedMovie.year}`,
              traktid: `${extendedMovie.traktId}`,
              imdbid: extendedMovie.imdbId,
              tmdbid: `${extendedMovie.tmdbId}`,
            },
          },
          {
            jobId: `${extendedMovie.slug}`,
          }
        );
      }
    } catch (error) {
      console.error('Failed to get movie', job.data, error);
      throw error;
    }
  }
}
