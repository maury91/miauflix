import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TraktService } from '../trakt/trakt.service';
import { MoviesData } from './movies.data';
import { MovieImages, GetMovieExtendedDataData, queues } from '@miauflix/types';
import { JackettQueues } from '../jackett/jackett.queues';

@Processor(queues.movie)
export class MovieProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktService,
    private readonly movieData: MoviesData,
    private readonly jackettQueuesService: JackettQueues
  ) {
    super();
  }

  private async getMovieExtendedData(movieSlug: string, images?: MovieImages) {
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
        await this.jackettQueuesService.requestTorrentSearch(
          extendedMovie,
          job.data.index,
          job.data.priority
        );
      }
    } catch (error) {
      console.error('Failed to get movie', job.data, error);
      throw error;
    }
  }
}
