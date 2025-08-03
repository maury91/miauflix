/**
 * Types for YTS API data structures and sanitization
 */

export interface YTSSourceMetadata {
  hash?: string;
  url?: string;
  quality?: string;
  type?: string;
  seeds?: number;
  peers?: number;
  size?: string;
  size_bytes?: number;
  date_uploaded?: string;
  date_uploaded_unix?: number;
}

export interface YTSCastMember {
  name?: string;
  character_name?: string;
  url_small_image?: string;
  imdb_code?: string;
}

export interface YTSMovie {
  id: number;
  url: string;
  imdb_code: string;
  title: string;
  title_english: string;
  title_long: string;
  slug: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  summary: string;
  description_full: string;
  synopsis: string;
  yt_trailer_code: string;
  language: string;
  mpa_rating: string;
  background_image: string;
  background_image_original: string;
  torrents: YTSSourceMetadata[];
  date_uploaded: string;
  date_uploaded_unix: number;
}

export interface YTSMovieDetails extends YTSMovie {
  like_count: number;
  description_intro: string;
  small_cover_image: string;
  medium_cover_image: string;
  large_cover_image: string;
  medium_screenshot_image1: string;
  medium_screenshot_image2: string;
  medium_screenshot_image3: string;
  large_screenshot_image1: string;
  large_screenshot_image2: string;
  large_screenshot_image3: string;
  cast: YTSCastMember[];
}

export interface YTSMovieListResponse {
  status: string;
  status_message: string;
  data: {
    movie_count: number;
    limit: number;
    page_number: number;
    movies: YTSMovie[];
  };
  '@meta': {
    server_time: number;
    server_timezone: string;
    api_version: number;
    execution_time: string;
  };
}

export interface YTSMovieDetailsResponse {
  status: string;
  status_message: string;
  data: {
    movie: YTSMovieDetails;
  };
  '@meta': {
    server_time: number;
    server_timezone: string;
    api_version: number;
    execution_time: string;
  };
}

export interface YTSWrappedResponse {
  body?: YTSMovieListResponse | YTSMovieDetailsResponse;
}

export type YTSApiResponse =
  | YTSMovieListResponse
  | YTSMovieDetailsResponse
  | YTSWrappedResponse
  | any;

/**
 * Legal hash with metadata
 */
export interface LegalHash {
  title: string;
  hash: string;
}

/**
 * Sanitization options
 */
export interface SanitizationOptions {
  /** Maximum number of movies to include in responses (default: 50) */
  maxMovies?: number;
  /** Whether to use legal hashes (default: true) */
  useLegalHashes?: boolean;
  /** Probability of using a legal hash vs random hash (default: 0.6) */
  legalHashProbability?: number;
  /** Change the download URL origin with a fixed string (default: none) */
  changeDownloadUrlOrigin?: string;
}
