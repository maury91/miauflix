import { Injectable } from '@nestjs/common';
import { getMovieTorrents } from '../flow/flow';
import { InjectModel } from '@nestjs/sequelize';
import { Movie } from '../database/entities/movie.entity';
import { MovieProcessorService } from './movies.processor.service';
import { VideoQuality } from '../jackett/jackett.types';
import { omit } from '../utils/object';
import { TraktService } from '../trakt/trakt.service';
import { TMDBService } from '../tmdb/tmdb.service';
import { GetMovieExtendedDataData, movieJobs, queues } from '../../queues';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MoviesData } from './movies.data';

@Injectable()
export class MovieService {
  constructor(
    private readonly traktService: TraktService,
    private readonly tmdbService: TMDBService,
    private readonly movieProcessorService: MovieProcessorService,
    private readonly movieData: MoviesData,
    @InjectModel(Movie) private readonly movieModel: typeof Movie,
    @InjectQueue(queues.movie)
    private readonly movieQueue: Queue<GetMovieExtendedDataData>
  ) {}

  public async getMovie(slug: string) {
    const { movie, torrents } = await getMovieTorrents({
      slug,
      movieModel: this.movieModel,
      getMovieExtendedData: this.movieProcessorService.getMovieExtendedData,
    });

    return {
      ...omit(movie.get({ plain: true }), [
        'createdAt',
        'updatedAt',
        'allTorrents',
        'torrentId',
      ]),
      availableQualities: Object.keys(torrents) as unknown as VideoQuality[],
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

  public async getTrendingMovies() {
    const movies = (await this.traktService.getTrendingMovies()).map(
      ({ movie }) => movie
    );
    const storedMovies = await this.getStoredMovies(
      movies.map((movie) => movie.ids.slug)
    );

    const moviesWithoutImages = movies
      .filter(
        (movie) =>
          !(
            movie.ids.slug in storedMovies &&
            storedMovies[movie.ids.slug].poster
          )
      )
      .map((movie) => movie.ids.tmdb);
    const movieImages = await Promise.all(
      moviesWithoutImages.map((movieTmdb) =>
        this.tmdbService
          .getMovieImages(`${movieTmdb}`)
          .then((fanart) => ({
            poster: fanart.posters[0]?.file_path ?? '',
            backdrop: fanart.backdrops[0]?.file_path ?? '',
            logo: fanart.logos[0]?.file_path ?? '',
          }))
          .catch((err) => {
            console.error('Failed to fetch fanart', err);
            return null;
          })
      )
    );
    const trendingMovies = movies.map((movie) => {
      if (moviesWithoutImages.includes(movie.ids.tmdb)) {
        return {
          ...movie,
          fanart: movieImages[moviesWithoutImages.indexOf(movie.ids.tmdb)],
        };
      }
      if (movie.ids.slug in storedMovies) {
        const storedMovie = storedMovies[movie.ids.slug];
        return {
          ...movie,
          fanart: {
            poster: storedMovie.poster,
            backdrop: storedMovie.backdrop,
            logo: storedMovie.logo,
          },
        };
      }
      // This should never happen, but just in case
      return {
        ...movie,
        fanart: {
          poster: '',
          backdrop: '',
          logo: '',
        },
      };
    });

    const moviesWithoutSource = trendingMovies.filter(
      (movie) =>
        !(
          movie.ids.slug in storedMovies &&
          storedMovies[movie.ids.slug].torrentFound
        )
    );

    this.movieQueue.addBulk(
      moviesWithoutSource.map((movie, index) => ({
        name: movieJobs.getMovieExtendedData,
        opts: {
          priority: 10000 + index,
        },
        data: {
          slug: movie.ids.slug,
          images: moviesWithoutImages.includes(movie.ids.tmdb)
            ? movieImages[moviesWithoutImages.indexOf(movie.ids.tmdb)]
            : {
                logo: '',
                backdrop: '',
                poster: '',
              },
        },
      }))
    );

    return trendingMovies.filter((movie) => {
      if (movie.ids.slug in storedMovies) {
        return !storedMovies[movie.ids.slug].noTorrentFound;
      }
      return true;
    });
  }
}
