import { Injectable } from '@nestjs/common';
import { TraktService } from '../trakt/trakt.service';
import { MoviesData } from './movies.data';
import { MoviesImages } from './movies.types';

@Injectable()
export class MovieProcessorService {
  constructor(
    private readonly traktService: TraktService,
    private readonly movieData: MoviesData
  ) {}

  public getMovieExtendedData = async (
    movieSlug: string,
    images?: MoviesImages
  ) => {
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
  };
}
