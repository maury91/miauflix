// Temporary API types - Phase 0 bootstrap
// These types replace the @miauflix/types imports until proper integration

export type VideoQualityStr = '2160' | '1440' | '1080' | '720';

// User types
export interface UserDto {
  id: number;
  name: string;
  email?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  // TODO: remove once backend provides proper slug
  slug?: string;
}

export interface DeviceLoginDto {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  // TODO: backend response should include expiration date
  expiresAt?: string;
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
  // Additional fields used in the UI
  ids?: { slug: string };
  images?: { backdrop: string; backdrops: string[]; logos: string[] };
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
  qualities?: VideoQualityStr[];
}

export interface ExtendedShowDto extends ExtendedMediaDto {
  type: 'show';
  seasons?: SeasonDto[];
  totalSeasons?: number;
  totalEpisodes?: number;
  seasonsCount?: number;
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
  // TODO: remove once backend provides this info
  season?: number;
  episode?: number;
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
