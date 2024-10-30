import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  GetMovieExtendedDataData,
  jackettJobs,
  queues,
  SearchMovieData,
} from '../../queues';
import { Job, Queue } from 'bullmq';
import { MoviesImages } from './movies.types';
import { TraktService } from '../trakt/trakt.service';
import { MoviesData } from './movies.data';

@Processor(queues.movie)
export class MovieProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktService,
    private readonly movieData: MoviesData,
    @InjectQueue(queues.jackett)
    private readonly jackettQueue: Queue<
      SearchMovieData,
      void,
      jackettJobs.searchMovie
    >
  ) {
    super();
  }

  private async getMovieExtendedData(movieSlug: string, images?: MoviesImages) {
    const movieExists = await this.movieData.findMovie(movieSlug);
    if (movieExists) {
      if (images && images.poster && !movieExists.poster) {
        await movieExists.update(images);
      }
      return movieExists;
    }
    const movie = await this.traktService.getMovie(movieSlug, true);

    return await this.movieData.createMovie({
      slug: movie.ids.slug,
      title: movie.title,
      year: movie.year,
      genres: movie.genres,
      runtime: movie.runtime,
      overview: movie.overview,
      rating: movie.rating,
      trailer: movie.trailer,
      traktId: movie.ids.trakt,
      imdbId: movie.ids.imdb,
      tmdbId: movie.ids.tmdb,
      poster: images?.poster,
      backdrop: images?.backdrop,
      backdrops: images?.backdrops,
      logos: images?.logos,
    });
  }

  async process(job: Job<GetMovieExtendedDataData>) {
    // Double check if the movie is in the database
    try {
      const extendedMovie = await this.getMovieExtendedData(
        job.data.slug,
        job.data.images
      );
      if (!extendedMovie.torrentsSearched) {
        const jobId = `search_torrents_${extendedMovie.slug}`;
        await this.jackettQueue.add(
          jackettJobs.searchMovie,
          {
            movieId: extendedMovie.id,
            index: job.data.index,
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
            jobId,
            priority: job.data.priority ?? (job.data.index < 10 ? 1000 : 2000),
          }
        );
        return {
          nextJobId: jobId,
        };
      }
      return {
        nextJobId: null,
      };
    } catch (error) {
      console.error('Failed to get movie', job.data, error);
      throw error;
    }
  }
}
