export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_token: string;
  scope: 'public';
  created_at: number;
}

export interface UserProfileResponse {
  username: string;
  private: boolean;
  name: string;
  vip: boolean;
  vip_ep: boolean;
  ids: {
    slug: string;
  };
}

export interface Movie {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    imdb: string;
    tmdb: number;
  };
}

export interface ExtendedMovie extends Movie {
  tagline: string;
  overview: string;
  released: string;
  runtime: number;
  country: string;
  trailer: string;
  homepage: string;
  status: 'released';
  rating: number;
  votes: number;
  comment_count: number;
  updated_at: string;
  language: string;
  languages: string[];
  available_translations: string[];
  genres: string[];
  certification: 'PG';
}

export type TrendingMoviesResponse = {
  watchers: number;
  movie: Movie;
}[];

export type MostFavoritedMoviesResponse = {
  user_count: number;
  movie: Movie;
}[];

export type MostPlayedMoviesResponse = {
  watcher_count: number;
  play_count: number;
  collected_count: number;
  movie: Movie;
}[];

export type MostWatchedMoviesResponse = MostPlayedMoviesResponse;
export type MostCollectedMoviesResponse = MostPlayedMoviesResponse;
export type PopularMoviesResponse = Movie[];

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Episode {}

export type MovieProgress = {
  progress: number;
  paused_at: string;
  id: number;
  type: 'movie';
  movie: Movie;
};

export type EpisodeProgress = {
  progress: number;
  paused_at: string;
  id: number;
  type: 'episode';
  episode: Episode;
};

export type ProgressResponse = (MovieProgress | EpisodeProgress)[];

export type SearchMoviesResponse = {
  type: 'movie';
  score: number;
  movie: Movie;
}[];
