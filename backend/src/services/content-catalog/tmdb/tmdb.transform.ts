import type { Movie } from '@entities/movie.entity';
import type { TVShow } from '@entities/tvshow.entity';

import type { MovieMediaSummary, TVShowMediaSummary } from './tmdb.types';

export const movieSummaryToMovie = (
  movieSummary: MovieMediaSummary
): Pick<
  Movie,
  'backdrop' | 'overview' | 'popularity' | 'poster' | 'releaseDate' | 'title' | 'tmdbId'
> => {
  return {
    tmdbId: movieSummary.id,
    title: movieSummary.title,
    overview: movieSummary.overview,
    releaseDate: movieSummary.release_date,
    poster: movieSummary.poster_path,
    backdrop: movieSummary.backdrop_path,
    popularity: movieSummary.popularity,
  };
};
export const tvShowSummaryToTVShow = (
  tvShowSummary: TVShowMediaSummary
): Pick<
  TVShow,
  'backdrop' | 'firstAirDate' | 'name' | 'overview' | 'popularity' | 'poster' | 'rating' | 'tmdbId'
> => {
  return {
    tmdbId: tvShowSummary.id,
    name: tvShowSummary.name,
    overview: tvShowSummary.overview,
    poster: tvShowSummary.poster_path,
    backdrop: tvShowSummary.backdrop_path,
    firstAirDate: tvShowSummary.first_air_date,
    popularity: tvShowSummary.popularity,
    rating: tvShowSummary.vote_average,
  };
};
