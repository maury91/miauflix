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
  mediaId: number;
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
}

export interface TVShowDto {
  _type: 'tvshow';
  id: number;
  mediaId: number;
  imdbId?: string | null;
  name: string;
  overview: string;
  tagline?: string;
  poster: string;
  backdrop: string;
  logo?: string;
  genres: string[];
  popularity: number;
  rating: number;
  firstAirDate: string;
  episodeRunTime?: number[];
  type?: string;
  inProduction?: boolean;
}

export type MediaDto = MovieDto | TVShowDto;

export interface ListResponse {
  results: MediaDto[];
  total: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}
