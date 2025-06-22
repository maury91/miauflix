// IMDB Detail Endpoint Response Types
export interface ImdbDetailResponse {
  imdb: ImdbMetadata;
  trb_posts: ImdbDetailPost[];
}

export interface ImdbMetadata {
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
  category: number;
  category_str: string;
  type: string;
  genre: string[];
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
  files: TorrentFile[];
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

export interface TorrentFile {
  name: string;
  size: number;
  full_location: string;
}

export interface TrackerInfo {
  seeders: number;
  tracker: string;
  leechers: number;
  completed: number;
  scrape_error?: string | null;
}

// Get Posts Endpoint Response Types
export interface GetPostsResponse {
  results: GetPostsTorrent[];
  links: {
    next: string | null;
    previous: string | null;
  };
  page_size: number;
  count: number;
  total: number;
}

export interface GetPostsTorrent {
  pk: number; // post ID
  n: string; // name/title
  a: string; // added timestamp
  c: number; // category
  s: number; // size in bytes
  t: null; // thumbnail URL (null if not available)
  u: string; // uploader username
  se: number; // seeders
  le: number; // leechers
  i: string; // imdb_id
  h: string; // info_hash
  tg: string[]; // tags array
}

// IMDB ID validation
export interface ImdbIdValidation {
  isValid: boolean;
  normalizedId?: string;
  error?: string;
}
