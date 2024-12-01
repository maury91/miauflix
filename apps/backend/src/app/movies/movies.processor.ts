import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TraktApi } from '../trakt/trakt.api';
import { MoviesData } from './movies.data';
import {
  MediaImages,
  GetMovieExtendedDataData,
  queues,
  SearchImagesForMovieData,
  movieJobs,
} from '@miauflix/types';
import { JackettQueues } from '../jackett/jackett.queues';
import { TMDBApi } from '../tmdb/tmdb.api';

@Processor(queues.movie)
export class MovieProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktApi,
    private readonly tmdbApi: TMDBApi,
    private readonly movieData: MoviesData,
    private readonly jackettQueuesService: JackettQueues
  ) {
    super();
  }

  private async getMovieExtendedData(movieSlug: string, images?: MediaImages) {
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

  async processGetMovieExtendedData(
    job: Job<GetMovieExtendedDataData, void, movieJobs.getMovieExtendedData>
  ) {
    // Double check if the movie is in the database
    try {
      const extendedMovie = await this.getMovieExtendedData(
        job.data.slug,
        job.data.images
      );
      if (!extendedMovie.sourcesSearched) {
        await this.jackettQueuesService.requestTorrentMovieSearch(
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

  async processSearchImagesForMovie(
    job: Job<SearchImagesForMovieData, void, movieJobs.searchImagesForMovie>
  ) {
    try {
      const movie = await this.movieData.findMovie(job.data.slug);
      if (!movie) {
        console.error('Movie not found', job.data);
        return;
      }
      const images = await this.tmdbApi.getSimpleMediaImages(
        'movie',
        movie.tmdbId
      );
      await movie.update(images);
    } catch (error) {
      console.error('Failed to search images for movie', job.data, error);
      throw error;
    }
  }

  async process(
    job:
      | Job<GetMovieExtendedDataData, void, movieJobs.getMovieExtendedData>
      | Job<SearchImagesForMovieData, void, movieJobs.searchImagesForMovie>
  ) {
    switch (job.name) {
      case movieJobs.getMovieExtendedData:
        return this.processGetMovieExtendedData(job);
      case movieJobs.searchImagesForMovie:
        return this.processSearchImagesForMovie(job);
      default:
        throw new Error(`No processor for job ${job}`);
    }
  }
}
