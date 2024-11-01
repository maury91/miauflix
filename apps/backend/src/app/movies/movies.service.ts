import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Movie } from '../database/entities/movie.entity';
import { Movie as TraktMovie } from '../trakt/trakt.types';
import {
  ExtendedMovieDto,
  MovieDto,
  MovieImages,
  Paginated,
  VideoQualityStr,
} from '@miauflix/types';
import { TraktService } from '../trakt/trakt.service';
import { TMDBService } from '../tmdb/tmdb.service';
import {
  ChangePriorityForMovieData,
  GetMovieExtendedDataData,
  jackettJobs,
  movieJobs,
  queues,
  SearchMovieData,
  torrentOrchestratorJobs,
} from '../../queues';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import { MoviesData } from './movies.data';
import { Source } from '../database/entities/source.entity';

const NO_IMAGES: MovieImages = {
  logos: [],
  backdrop: '',
  backdrops: [],
  poster: '',
};

@Injectable()
export class MovieService {
  private movieEventsQueue: QueueEvents;
  constructor(
    private readonly traktService: TraktService,
    private readonly tmdbService: TMDBService,
    private readonly movieData: MoviesData,
    @InjectModel(Movie) private readonly movieModel: typeof Movie,
    @InjectQueue(queues.movie)
    private readonly movieQueue: Queue<GetMovieExtendedDataData>,
    @InjectQueue(queues.jackett)
    private readonly jackettQueue: Queue<
      SearchMovieData,
      void,
      jackettJobs.searchMovie
    >,
    @InjectQueue(queues.torrentOrchestrator)
    private readonly torrentOrchestratorQueue: Queue<
      ChangePriorityForMovieData,
      void,
      torrentOrchestratorJobs.changePriorityForMovie
    >
  ) {
    // ToDo: Use configuration for redis connection
    this.movieEventsQueue = new QueueEvents(queues.movie);
  }

  private async getExtendedMovie(slug: string) {
    const movie = await this.movieModel.findOne({
      where: {
        slug,
      },
      include: {
        model: Source,
        as: 'allSources',
        attributes: ['data', 'quality', 'codec'],
      },
    });

    if (!movie) {
      console.log('Movie not in DB');
      const traktMovie = await this.traktService.getMovie(slug);
      const images = await this.getMovieImages(traktMovie);
      const job = await this.requestMovieExtendedData(slug, 0, images, 0);
      await job.waitUntilFinished(this.movieEventsQueue);
      return this.getExtendedMovie(slug);
    }

    if (!movie.torrentsSearched) {
      console.log('Torrents not searched');
      this.prioritizeTorrentSearch(slug, 10);
    } else if (!movie.torrentFound) {
      console.log('Torrents not scanned');
      this.prioritizeScanTorrents(movie.id, 100);
    }

    return {
      movie,
      sources: movie.allSources,
    };
  }

  private async prioritizeTorrentSearch(slug: string, priority: number) {
    const jobId = `search_torrents_${slug}`;
    const job = await this.jackettQueue.getJob(jobId);
    if (job) {
      job.changePriority({ priority });
    }
  }

  private async prioritizeScanTorrents(movieId: number, priority: number) {
    this.torrentOrchestratorQueue.add(
      torrentOrchestratorJobs.changePriorityForMovie,
      {
        movieId,
        priority,
      }
    );
  }

  public async getMovie(slug: string): Promise<ExtendedMovieDto> {
    const { movie, sources } = await this.getExtendedMovie(slug);

    return {
      id: movie.slug,
      title: movie.title,
      year: movie.year,
      ids: {
        trakt: movie.traktId,
        slug: movie.slug,
        imdb: movie.imdbId,
        tmdb: movie.tmdbId,
      },
      images: {
        backdrop: movie.backdrop,
        backdrops: movie.backdrops,
        logos: movie.logos,
        poster: movie.poster,
      },
      overview: movie.overview,
      runtime: movie.runtime,
      trailer: movie.trailer,
      rating: Number(movie.rating),
      genres: movie.genres,
      qualities: [
        ...new Set<VideoQualityStr>(
          sources.map(({ quality }) => `${quality}` as const)
        ),
      ],
    };
  }

  private async getStoredMovies(slugs: string[]) {
    const storedMovies = await this.movieData.findMovies(slugs);
    return storedMovies.reduce<Record<string, Movie>>(
      (acc, movie) => ({
        ...acc,
        [movie.slug]: movie,
      }),
      {}
    );
  }

  private async getMovieImages(movie: TraktMovie) {
    const movieImages = await this.tmdbService.getMovieImages(
      `${movie.ids.tmdb}`
    );
    return {
      poster: movieImages.posters[0]?.file_path ?? '',
      backdrop: movieImages.backdrops[0]?.file_path ?? '',
      backdrops: movieImages.backdropsWithoutText.map(
        ({ file_path }) => file_path
      ),
      logos: movieImages.logos.map(({ file_path }) => file_path),
    };
  }

  private async requestMovieExtendedData(
    slug: string,
    index: number,
    images = NO_IMAGES,
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

  private async addExtendedDataToMovies(movies: TraktMovie[]) {
    const storedMovies = await this.getStoredMovies(
      movies.map((movie) => movie.ids.slug)
    );

    const moviesWithoutImages = movies.filter(
      (movie) =>
        !(movie.ids.slug in storedMovies && storedMovies[movie.ids.slug].poster)
    );

    const movieImages = await Promise.all(
      moviesWithoutImages.map<Promise<MovieImages>>((movie) =>
        this.getMovieImages(movie).catch((err) => {
          console.error('Failed to fetch images', err);
          return null;
        })
      )
    );

    const extendedMovies = movies.map<MovieDto>((movie) => {
      if (moviesWithoutImages.indexOf(movie) !== -1) {
        return {
          ...movie,
          id: movie.ids.slug,
          images: movieImages[moviesWithoutImages.indexOf(movie)],
        };
      }
      if (movie.ids.slug in storedMovies) {
        const storedMovie = storedMovies[movie.ids.slug];
        return {
          ...movie,
          id: movie.ids.slug,
          images: {
            poster: storedMovie.poster,
            backdrop: storedMovie.backdrop,
            backdrops: storedMovie.backdrops,
            logos: storedMovie.logos,
          },
        };
      }
      // This should never happen, but just in case
      return {
        ...movie,
        id: movie.ids.slug,
        images: {
          poster: '',
          backdrop: '',
          backdrops: [],
          logos: [],
        },
      };
    });

    const moviesWithIncompleteInformation = extendedMovies.filter(
      (movie) =>
        !(
          movie.ids.slug in storedMovies &&
          storedMovies[movie.ids.slug].torrentFound &&
          storedMovies[movie.ids.slug].poster
        )
    );

    moviesWithIncompleteInformation.forEach((movie, index) => {
      this.requestMovieExtendedData(
        movie.id,
        index,
        moviesWithoutImages.includes(movie)
          ? movieImages[moviesWithoutImages.indexOf(movie)]
          : undefined
      );
    });

    return extendedMovies.filter((movie) => {
      if (movie.ids.slug in storedMovies) {
        return !storedMovies[movie.ids.slug].noSourceFound;
      }
      return true;
    });
  }

  public async getTrendingMovies(page = 1): Promise<Paginated<MovieDto>> {
    const { data, ...pagination } = await this.traktService.getTrendingMovies(
      page
    );
    const movies = data.map((movie) => movie.movie);

    return {
      data: await this.addExtendedDataToMovies(movies),
      ...pagination,
    };
  }

  public async getPopularMovies(page = 1): Promise<Paginated<MovieDto>> {
    const { data: movies, ...pagination } =
      await this.traktService.getPopularMovies(page);

    return {
      data: await this.addExtendedDataToMovies(movies),
      ...pagination,
    };
  }
}
