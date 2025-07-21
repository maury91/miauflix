export interface ListDto {
  name: string;
  slug: string;
  description: string;
  url: string;
}

export type ListsResponse = ListDto[];

export interface MovieDto {
  _type: 'movie';
  id: number;
  tmdbId: number;
  imdbId?: string | null;
  title: string;
  overview: string;
  tagline?: string;
  poster: string;
  backdrop: string;
  logo?: string;
  genres: string[];
  popularity: number;
  rating: number;
  releaseDate: string;
  runtime?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TVShowDto {
  _type: 'tvshow';
  id: number;
  tmdbId: number;
  imdbId?: string | null;
  name: string;
  overview: string;
  tagline?: string;
  poster: string;
  backdrop: string;
  genres: string[];
  popularity: number;
  rating: number;
  firstAirDate: string;
  episodeRunTime?: number[];
  type?: string;
  inProduction?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MediaDto = MovieDto | TVShowDto;

export interface ListResponse {
  results: MediaDto[];
  total: number;
}
