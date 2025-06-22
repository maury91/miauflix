export interface BaseResponse {
  status: 'error' | 'ok';
  status_message: string;
  '@meta'?: {
    server_time: number;
    server_timezone: string;
    api_version: number;
    execution_time: string;
  };
}

export interface Movie {
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
  small_cover_image: string;
  medium_cover_image: string;
  large_cover_image: string;
  state: string;
  torrents: YTSSourceMetadata[];
  date_uploaded: string;
  date_uploaded_unix: number;
}

export interface YTSSourceMetadata {
  url: string;
  hash: string;
  quality: string; // "720p", "1080p", "2160p", etc.
  type: string; // "web", "bluray", etc.
  is_repack: string;
  video_codec: string; // "x264", "x265", etc.
  bit_depth: string; // "8", "10", etc.
  audio_channels: string; // "2.0", "5.1", etc.
  seeds: number;
  peers: number;
  size: string; // "1.88 GB", etc.
  size_bytes: number;
  date_uploaded: string;
  date_uploaded_unix: number;
}

export interface MovieListResponse extends BaseResponse {
  data: {
    movie_count: number;
    limit: number;
    page_number: number;
    movies: Movie[];
  };
}

export interface MovieDetailsResponse extends BaseResponse {
  data: {
    movie: Movie;
  };
}

export interface MovieSuggestionResponse extends BaseResponse {
  data: {
    movie_count: number;
    movies: Movie[];
  };
}

export interface ParentalGuide {
  type: string;
  guide_text: string;
}

export interface MovieParentalGuidesResponse extends BaseResponse {
  data: {
    parental_guide_count: number;
    parental_guides: ParentalGuide[];
  };
}
