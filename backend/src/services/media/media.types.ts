import type { Genre } from '@entities/genre.entity';
import type { Movie } from '@entities/movie.entity';
import type { TVShow } from '@entities/tvshow.entity';

export interface GenreWithLanguages extends Genre {
  languages: string[];
}
export interface TranslatedMovie extends Omit<Movie, 'genres' | 'translations'> {
  genres: string[];
}
export interface TranslatedTVShow extends Omit<TVShow, 'genres' | 'translations'> {
  genres: string[];
}
export type TranslatedMedia = TranslatedMovie | TranslatedTVShow;
