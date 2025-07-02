/**
 * Types for TheRarBG API data structures and sanitization
 */

// GetPosts Endpoint Response Types
export interface GetPostsResponse {
  results: GetPosts[];
  links: {
    next: string | null;
    previous: string | null;
  };
  page_size: number;
  count: number;
  total: number;
}

export interface GetPosts {
  pk: number | string; // post ID
  n: string; // name/title
  a: string | number; // added timestamp
  c: number | string; // category
  s: number; // size in bytes
  t: string | null; // thumbnail URL (null if not available)
  u: string; // uploader username
  se: number; // seeders
  le: number; // leechers
  i: string | null; // imdb_id
  h: string; // info_hash
  tg: string[]; // tags array
}

// IMDB Detail Endpoint Response Types
export interface ImdbDetailResponse {
  imdb: ImdbMovieMetadata;
  trb_posts: ImdbDetailPost[];
}

export interface ImdbMovieMetadata {
  imdb_id: string;
  tmdb_id?: number;
  name: string;
  content_type: string; // e.g., "tvSeries", "movie"
  thumbnail?: string;
  image?: string;
  award?: {
    wins: number;
    nominations: number;
  };
  genre_list: string[];
  genre: string;
  theme_list: string[];
  release_detailed: {
    day: number;
    date: string;
    year: number;
    month: number;
    originLocations: Array<{
      cca2: string;
      country: string;
    }>;
    releaseLocation: {
      cca2: string;
      country: string;
    };
  };
  spoken_languages: Array<{
    id: string;
    language: string;
  }>;
  actors: string[];
  top_credits: Array<{
    id: string;
    name: string;
    credits: string[];
  }>;
  directors: string[];
  runtime: string;
  rating: string;
  rating_count: number;
  director: string;
  cast: string;
  plot: string;
  budget: number;
  video_list: unknown[];
  rott_url?: string | null;
  rott_score_official: number;
  rott_score_audience: number;
  mpa_rating?: string | null;
  critics_consensus?: string | null;
  is_recomended: boolean;
  has_post: boolean;
  updated_at: string;
  created_at: string;
}

export interface ImdbDetailPost {
  eid: string;
  pid: number;
  category: number | null;
  category_str: string;
  type: string | null;
  genre: string[] | null;
  status: string | null;
  name: string;
  short_name: string | null;
  num_files: number;
  size: number;
  size_char: string;
  thumbnail: string | null;
  seeders: number;
  leechers: number;
  username: string;
  downloads: number;
  added: number; // Unix timestamp
  descr: string | null;
  imdb: string;
  language: string;
  info_hash: string;
  textlanguage: string | null;
  trailer: string | null;
  season: number; // 0 in case of movies
  episode: number; // 0 in case of movies
  timestamp: string;
  last_checked: string;
  files: SourceFile[] | null;
  trackers: TrackerInfo[];
  has_torrent: boolean;
  images: string[];
  is_recomended: boolean;
  source: string; // 1 / TP
  source_list: string[];
  extra_data: {
    pending_torrent: boolean;
  };
  upvotes: number;
  downvotes: number;
  report_count: number;
  comment_count: number;
  imdb_data: number;
}

export interface SourceFile {
  name: string;
  size: number;
  full_location?: string;
}

export interface TrackerInfo {
  seeders: number;
  tracker: string;
  leechers: number;
  completed: number;
  scrape_error?: string | null;
}

// HTTP VCR Wrapper Types
export interface TheRarBGWrappedResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: GetPostsResponse | ImdbDetailResponse;
  bodyIsJson?: boolean;
}

export type TheRarBGApiResponse =
  | GetPostsResponse
  | ImdbDetailResponse
  | TheRarBGWrappedResponse
  | any;

/**
 * Configuration options for TheRarBG sanitization
 */
export interface SanitizationOptions {
  /** Maximum number of items to return */
  maxItems?: number;

  /** Whether to preserve year information in titles */
  preserveYear?: boolean;

  /** Whether to preserve technical metadata (codecs, quality, etc.) */
  preserveTechnicalMetadata?: boolean;

  /** Whether to preserve IMDB IDs instead of generating fake ones */
  preserveImdbId?: boolean;

  /** Whether to generate consistent fake data using deterministic seeding */
  generateConsistentFakes?: boolean;

  /** Whether to use legal hashes for testing real downloads */
  useLegalHashes?: boolean;

  /** Strategy for selecting legal hashes when useLegalHashes is true */
  legalHashStrategy?: 'imdb-based' | 'random' | 'sequential' | 'weighted';

  /** Custom seed for deterministic generation (overrides IMDB-based seeding) */
  customSeed?: string;

  /** Minimum number of legal hashes to ensure are available */
  minLegalHashes?: number;

  /** Whether to validate that legal hashes are actually downloadable */
  validateLegalHashes?: boolean;
}

/**
 * Legal hash selection strategy types
 */
export type LegalHashStrategy = 'imdb-based' | 'random' | 'sequential' | 'weighted';

/**
 * Legal hash with metadata for validation and selection
 */
export interface LegalHash {
  /** Human-readable title of the content */
  title: string;

  /** SHA-1 info hash (40 hex characters) */
  hash: string;

  /** Optional metadata for weighted selection */
  weight?: number;

  /** Content type for better matching */
  type?: ContentType;

  /** Year of release for temporal matching */
  year?: number;

  /** Last validation timestamp */
  lastValidated?: Date;

  /** Whether this hash was confirmed to be downloadable */
  validated?: boolean;
}

/**
 * Parsed name components
 */
export interface ParsedName {
  /** The original full name */
  original: string;
  /** The movie/show title portion */
  title: string;
  /** The year if found */
  year?: string;
  /** Quality (720p, 1080p, 4K, etc.) */
  quality?: string;
  /** Video codec (x264, x265, H.264, etc.) */
  videoCodec?: string;
  /** Audio codec/format (DTS, AAC, AC3, etc.) */
  audioCodec?: string;
  /** Source (BluRay, WEB-DL, etc.) */
  source?: string;
  /** Release group in brackets */
  releaseGroup?: string;
  /** HDR indicators (HDR, DV, etc.) */
  hdr?: string;
  /** Other technical metadata */
  technicalParts: string[];
  /** Whether parsing was successful */
  parsed: boolean;
}

/**
 * Name parsing error
 */
export interface NameParsingError extends Error {
  name: 'NameParsingError';
  originalName: string;
  reason: string;
}

/**
 * TheRARBG API response types for sanitization
 */

export interface TheRARBGImdbData {
  imdb_id: string;
  tmdb_id: number;
  name: string;
  content_type: 'Movie' | 'TV' | string;
  thumbnail?: string;
  image?: string;
  award?: {
    wins: number;
    nominations: number;
  };
  genre_list: string[];
  genre: string;
  theme_list: string[];
  release_detailed: {
    day: number;
    date: string;
    year: number;
    month: number;
    originLocations: Array<{
      cca2: string;
      country: string;
    }>;
    releaseLocation: {
      cca2: string;
      country: string;
    };
  };
  spoken_languages: Array<{
    id: string;
    language: string;
  }>;
  actors: string[];
  top_credits: Array<{
    id: string;
    name: string;
    credits: string[];
  }>;
  directors: string[];
  runtime: string;
  rating: string;
  rating_count: number;
  director: string;
  cast: string;
  plot: string;
  budget?: number;
  video_list: Array<{
    key: string;
    site: string;
  }>;
  rott_url?: string;
  rott_score_official?: number;
  rott_score_audience?: number;
  mpa_rating?: string;
  critics_consensus?: string;
  is_recomended: boolean;
  has_post: boolean;
  updated_at: string;
  created_at: string;
}

export interface TheRARBGPost {
  eid: string;
  pid: number;
  category: string | null;
  category_str: string;
  type: string | null;
  genre: string[] | null;
  status: string | null;
  name: string;
  short_name: string | null;
  num_files: number;
  size: number;
  size_char: string;
  thumbnail: string | null;
  seeders: number;
  leechers: number;
  username: string;
  downloads: number;
  added: number;
  descr: string | null;
  imdb: string;
  language: string;
  info_hash: string;
  textlanguage: string | null;
  trailer: string | null;
  season: number;
  episode: number;
  timestamp: string;
  last_checked: string;
  files: Array<{
    name: string;
    size: number;
    full_location: string;
  }>;
  trackers: Array<{
    seeders: number;
    tracker: string;
    leechers: number;
    completed: number;
    scrape_error: string | null;
  }>;
  has_torrent: boolean;
  images: string[];
  is_recomended: boolean;
  source: string;
  source_list: string[];
  extra_data: Record<string, any>;
  upvotes: number;
  downvotes: number;
  report_count: number;
  comment_count: number;
  imdb_data: number;
}

export interface TheRARBGApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: {
    imdb: TheRARBGImdbData;
    trb_posts: TheRARBGPost[];
  };
  bodyIsJson: boolean;
}

export type ContentType = 'Movie' | 'TV' | 'documentary' | 'educational' | 'short';

export interface TitleMapping {
  realTitle: string;
  fakeTitle: string;
  realImdbId: string;
  fakeImdbId: string;
  year?: number;
  contentType: 'Movie' | 'TV';
}

export interface NameMetadata {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  quality?: string;
  videoCodec?: string;
  audioCodec?: string;
  source?: string;
  edition?: string;
  language?: string;
  releaseGroup?: string;
}
