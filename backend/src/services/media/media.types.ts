import { Genre } from "@entities/genre.entity";
import { Movie } from "@entities/movie.entity";
import { TVShow } from "@entities/tvshow.entity";

export interface GenreWithLanguages extends Genre {
  languages: string[];
}
export interface TranslatedMovie
  extends Omit<Movie, "genres" | "translations"> {
  genres: string[];
}
export interface TranslatedTVShow
  extends Omit<TVShow, "genres" | "translations"> {
  genres: string[];
}
export type TranslatedMedia = TranslatedMovie | TranslatedTVShow;
