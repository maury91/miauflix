import { Injectable } from '@nestjs/common';
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
import { MoviesData } from './movies.data';
import { JackettQueues } from '../jackett/jackett.queues';
import { TorrentOrchestratorQueues } from '../torrent/torrent.orchestrator.queues';
import { MoviesQueues } from './movies.queues';

const NO_IMAGES: MovieImages = {
  logos: [],
  backdrop: '',
  backdrops: [],
  poster: '',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class MovieService {
  constructor(
    private readonly traktService: TraktService,
    private readonly tmdbService: TMDBService,
    private readonly movieData: MoviesData,
    private readonly jackettQueuesService: JackettQueues,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues,
    private readonly moviesQueuesService: MoviesQueues
  ) {}

  private async getExtendedMovie(slug: string) {
    const movie = await this.movieData.findMovieWithSources(slug);

    if (!movie) {
      console.log('Movie not in DB');
      const traktMovie = await this.traktService.getMovie(slug);
      const images = await this.getMovieImages(traktMovie);
      const job = await this.moviesQueuesService.requestMovieExtendedData(
        slug,
        0,
        images,
        0
      );
      await this.moviesQueuesService.waitForJob(job);
      return this.getExtendedMovie(slug);
    }

    if (!movie.torrentsSearched) {
      console.log('Torrents not searched');
      if (
        !(await this.jackettQueuesService.prioritizeTorrentSearch(slug, 10))
      ) {
        console.log('Requesting search');
        await this.jackettQueuesService.requestTorrentSearch(movie, 0, 10);
      }
    } else if (!movie.torrentFound) {
      console.log('Torrents not scanned');
      this.torrentOrchestratorQueuesService.prioritizeScanTorrents(
        movie.id,
        100
      );
    }

    return {
      movie,
      sources: movie.allSources,
    };
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
      sourceFound: sources.length > 0,
      noSourceFound: movie.noSourceFound,
      qualities: [
        ...new Set<VideoQualityStr>(
          sources.map(({ quality }) => `${quality}` as const)
        ),
      ],
    };
  }

  private async getMovieImages(movie: TraktMovie) {
    return await this.tmdbService.getSimpleMovieImages(`${movie.ids.tmdb}`);
  }

  public async addExtendedDataToMovies(movies: TraktMovie[]) {
    const storedMovies = await this.movieData.findMoviesMap(
      movies.map((movie) => movie.ids.slug)
    );

    const moviesWithoutSource: string[] = [];
    const [moviesWithImages, moviesWithIncompleteInformation] =
      await this.tmdbService.addImagesToMovies(
        movies.map((movie) => {
          if (movie.ids.slug in storedMovies) {
            if (!storedMovies[movie.ids.slug].sourceFound) {
              moviesWithoutSource.push(movie.ids.slug);
            }
            return storedMovies[movie.ids.slug];
          }
          return {
            ...movie,
            sourceFound: false,
            noSourceFound: false,
            id: movie.ids.slug,
            images: NO_IMAGES,
          };
        })
      );

    new Set([
      ...moviesWithIncompleteInformation,
      ...moviesWithoutSource,
    ]).forEach((movieId) => {
      const index = moviesWithImages.findIndex(
        (movieWithImage) => movieWithImage.id === movieId
      );
      if (index !== -1) {
        this.moviesQueuesService.requestMovieExtendedData(
          movieId,
          index,
          moviesWithImages[index].images
        );
      } else {
        console.error('Movie not found in moviesWithImages', movieId);
      }
    });

    return moviesWithImages.filter((movie) => !movie.noSourceFound);
  }

  private async preCacheNextPages(
    page: number,
    totalPages: number,
    method: 'getTrendingMovies' | 'getPopularMovies'
  ) {
    for (
      let nextPage = page + 1;
      nextPage <= Math.min(page + 5, totalPages);
      nextPage++
    ) {
      await sleep(500);
      await this.traktService[method](page);
    }
  }

  public async getTrendingMovies(page = 1): Promise<Paginated<MovieDto>> {
    const { data, ...pagination } = await this.traktService.getTrendingMovies(
      page
    );
    this.preCacheNextPages(page, pagination.totalPages, 'getTrendingMovies');
    const movies = data.map((movie) => movie.movie);

    return {
      data: await this.addExtendedDataToMovies(movies),
      ...pagination,
    };
  }

  public async getPopularMovies(page = 1): Promise<Paginated<MovieDto>> {
    const { data: movies, ...pagination } =
      await this.traktService.getPopularMovies(page);
    this.preCacheNextPages(page, pagination.totalPages, 'getPopularMovies');

    return {
      data: await this.addExtendedDataToMovies(movies),
      ...pagination,
    };
  }
}
