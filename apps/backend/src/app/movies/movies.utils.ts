import { Movie } from '../../database/entities/movie.entity';
import { MovieDto } from '@miauflix/types';

export const movieToDto = (movie: Movie): MovieDto => ({
  type: 'movie',
  id: 0,
  title: movie.title,
  year: movie.year,
  ids: {
    trakt: movie.traktId,
    slug: movie.slug,
    imdb: movie.imdbId,
    tmdb: movie.tmdbId,
  },
  noSourceFound: movie.noSourceFound,
  sourceFound: movie.sourceFound,
  images: {
    poster: movie.poster,
    backdrop: movie.backdrop,
    backdrops: movie.backdrops,
    logos: movie.logos,
  },
});
