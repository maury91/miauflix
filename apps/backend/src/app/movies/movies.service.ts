import { Injectable } from '@nestjs/common';
import { Movie as TraktMovie } from '../trakt/trakt.types';
import {
  ExtendedMovieDto,
  MovieDto,
  Paginated,
  VideoQualityStr,
} from '@miauflix/types';
import { NO_IMAGES, TMDBApi } from '../tmdb/tmdb.api';
import { MoviesData } from './movies.data';
import { JackettQueues } from '../jackett/jackett.queues';
import { TorrentOrchestratorQueues } from '../torrent/torrent.orchestrator.queues';
import { MoviesQueues } from './movies.queues';
import { TraktApi } from '../trakt/trakt.api';
import { Movie } from '../../database/entities/movie.entity';
import { movieToDto } from './movies.utils';

@Injectable()
export class MoviesService {
  constructor(
    private readonly traktService: TraktApi,
    private readonly tmdbApi: TMDBApi,
    private readonly movieData: MoviesData,
    private readonly jackettQueuesService: JackettQueues,
    private readonly torrentOrchestratorQueuesService: TorrentOrchestratorQueues,
    private readonly moviesQueuesService: MoviesQueues
  ) {}

  private async getExtendedMovie(slug: string): Promise<Movie> {
    const movie = await this.movieData.findMovieWithSources(slug);

    if (!movie) {
      const traktMovie = await this.traktService.getMovie(slug);
      const images = await this.tmdbApi.getSimpleMediaImages(
        'movie',
        `${traktMovie.ids.tmdb}`
      );
      const job = await this.moviesQueuesService.requestMovieExtendedData(
        slug,
        0,
        images,
        0
      );
      await this.moviesQueuesService.waitForJob(job);
      return this.getExtendedMovie(slug);
    }

    if (!movie.sourcesSearched) {
      if (
        !(await this.jackettQueuesService.prioritizeTorrentSearch(slug, 10))
      ) {
        await this.jackettQueuesService.requestTorrentMovieSearch(movie, 0, 10);
      }
    } else if (!movie.sourceFound) {
      this.torrentOrchestratorQueuesService.prioritizeScanTorrents(
        movie.id,
        'movie',
        100
      );
    }

    return movie;
  }

  public async getMovie(slug: string): Promise<ExtendedMovieDto> {
    const movie = await this.getExtendedMovie(slug);

    return {
      ...movieToDto(movie),
      id: movie.id,
      overview: movie.overview,
      runtime: movie.runtime,
      trailer: movie.trailer,
      rating: Number(movie.rating),
      genres: movie.genres,
      sourceFound: movie.sources.length > 0,
      qualities: [
        ...new Set<VideoQualityStr>(
          movie.sources.map(({ quality }) => `${quality}` as const)
        ),
      ],
    };
  }

  public async addExtendedDataToMovies(
    movies: TraktMovie[]
  ): Promise<MovieDto[]> {
    const storedMovies = await this.movieData.findMoviesMap(
      movies.map((movie) => movie.ids.slug)
    );

    const moviesWithoutSource: string[] = [];
    const [moviesWithImages, moviesWithIncompleteInformation] =
      await this.tmdbApi.addImagesToMedias(
        'movie',
        movies.map((movie) => {
          if (movie.ids.slug in storedMovies) {
            if (!storedMovies[movie.ids.slug].sourceFound) {
              moviesWithoutSource.push(movie.ids.slug);
            }
            return storedMovies[movie.ids.slug];
          }
          return {
            ...movie,
            type: 'movie' as const,
            sourceFound: false,
            noSourceFound: false,
            id: 0,
            images: NO_IMAGES,
          };
        })
      );

    new Set([
      ...moviesWithIncompleteInformation,
      ...moviesWithoutSource,
    ]).forEach((movieId) => {
      const index = moviesWithImages.findIndex(
        (movieWithImage) => movieWithImage.ids.slug === movieId
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

  public async getTrendingMovies(page = 0): Promise<Paginated<MovieDto>> {
    const { data, ...pagination } = await this.traktService.getTrendingMovies(
      page
    );
    const movies = data.map((movie) => movie.movie);

    return {
      data: await this.addExtendedDataToMovies(movies),
      ...pagination,
    };
  }

  public async getPopularMovies(page = 0): Promise<Paginated<MovieDto>> {
    const { data: movies, ...pagination } =
      await this.traktService.getPopularMovies(page);

    return {
      data: await this.addExtendedDataToMovies(movies),
      ...pagination,
    };
  }
}
