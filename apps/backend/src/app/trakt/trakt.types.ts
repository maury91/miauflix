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
  certification: string;
}

export interface ShowSimple {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    tvdb: number;
    imdb: string;
    tmdb: number;
    // "tvrage": {}
  };
}

export interface ExtendedShow extends ShowSimple {
  tagline: string;
  overview: string;
  first_aired: string;
  airs: {
    day: string; // Day of the week
    time: string;
    timezone: string;
  };
  runtime: number;
  certification: string;
  network: string;
  country: string;
  trailer: string;
  homepage: string;
  status: string;
  rating: number;
  votes: number;
  comment_count: number;
  updated_at: string;
  language: string;
  languages: string[];
  available_translations: string[];
  genres: string[];
  aired_episodes: number;
}

export type Show<E extends boolean> = E extends true
  ? ExtendedShow
  : ShowSimple;

export interface ShowSeasonSimple {
  number: number;
  ids: {
    trakt: number;
    tvdb: number;
    tmdb: number;
  };
}

export interface ShowSeasonExtended extends ShowSeasonSimple {
  rating: number;
  votes: number;
  episode_count: number;
  aired_episodes: number;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  overview: string | {};
  first_aired: string;
  updated_at: string;
  network: string;
  // episodes: ShowEpisode[];
}

export type ShowSeason<E extends boolean> = E extends true
  ? ShowSeasonExtended
  : ShowSeasonSimple;

export interface ShowEpisodeSimple {
  season: number;
  number: number;
  title: string;
  ids: {
    trakt: number;
    tvdb: number;
    imdb: string;
    tmdb: number;
  };
}

export interface ShowEpisodeExtended extends ShowEpisodeSimple {
  number_abs: number;
  overview: string;
  rating: number;
  votes: number;
  comment_count: number;
  first_aired: string;
  updated_at: string;
  available_translations: string[];
  runtime: number;
  episode_type:
    | 'standard'
    | 'series_premiere'
    | 'season_premiere'
    | 'mid_season_finale'
    | 'mid_season_premiere'
    | 'season_finale'
    | 'series_finale';
}

export type ShowEpisode<E extends boolean> = E extends true
  ? ShowEpisodeExtended
  : ShowEpisodeSimple;

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

export type TrendingShowsResponse = {
  watchers: number;
  show: ShowSimple;
}[];

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
