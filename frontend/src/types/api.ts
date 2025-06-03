// Temporary API types - Phase 0 bootstrap
// These types replace the @miauflix/types imports until proper integration

// User types
export interface UserDto {
  id: number;
  name: string;
  email?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceLoginDto {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceLoginStatusDto {
  loggedIn: boolean;
  user?: UserDto;
  accessToken?: string;
}

// Media types
export interface MediaDto {
  id: string;
  title: string;
  type: 'movie' | 'show';
  year?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  rating?: number;
  genres?: string[];
  imdbId?: string;
  tmdbId?: number;
}

export interface ExtendedMediaDto extends MediaDto {
  runtime?: number;
  releaseDate?: string;
  cast?: string[];
  director?: string;
  writer?: string;
  country?: string;
  language?: string;
  trailer?: string;
}

export interface ExtendedMovieDto extends ExtendedMediaDto {
  type: 'movie';
}

export interface ExtendedShowDto extends ExtendedMediaDto {
  type: 'show';
  seasons?: SeasonDto[];
  totalSeasons?: number;
  totalEpisodes?: number;
}

export interface SeasonDto {
  id: string;
  seasonNumber: number;
  title?: string;
  overview?: string;
  airDate?: string;
  episodes: EpisodeDto[];
}

export interface EpisodeDto {
  id: string;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDate?: string;
  runtime?: number;
  still?: string;
}

// Stream types
export interface GetStreamDto {
  streamId: string;
  streamUrl: string;
  subtitles?: SubtitleDto[];
  quality?: string;
  codec?: string;
}

export interface SubtitleDto {
  language: string;
  url: string;
  label: string;
}

// Progress types
export interface MovieProgressDto {
  id: string;
  type: 'movie';
  progress: number;
  status: 'watching' | 'completed' | 'paused';
  lastWatched: string;
  movie: MediaDto;
}

export interface ShowProgressDto {
  id: string;
  type: 'show';
  progress: number;
  status: 'watching' | 'completed' | 'paused';
  lastWatched: string;
  show: MediaDto;
  currentEpisode?: EpisodeDto;
  currentSeason?: number;
}

export interface TrackPlaybackRequest {
  progress: number;
  status: 'watching' | 'completed' | 'paused';
  type: 'movie' | 'episode';
}

// Category types
export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  mediaCount?: number;
}

// Pagination
export interface Paginated<T> {
  data: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
}
