export interface ConfigurationResponse {
  images: {
    base_url: string;
    secure_base_url: string;
    backdrop_sizes: string[];
    logo_sizes: string[];
    poster_sizes: string[];
    profile_sizes: string[];
    still_sizes: string[];
  };
  change_keys: string[];
}

interface Image {
  aspect_ratio: number;
  file_path: string;
  height: number;
  iso_639_1: string;
  vote_average: number;
  vote_count: number;
  width: number;
}

export type MediaType = "movie" | "tv";

export interface CrewMember {
  job: string;
  department: string;
  credit_id: string;
  adult: boolean;
  gender: number | null;
  id: number;
  known_for_department: string;
  name: string;
  original_name: string;
  popularity: number;
  profile_path: string;
}

export interface GuestStar {
  character: string;
  credit_id: string;
  order: number;
  adult: boolean;
  gender: number | null;
  id: number;
  known_for_department: string;
  name: string;
  original_name: string;
  popularity: number;
  profile_path: string;
}

export interface ShowEpisode {
  air_date: string;
  crew: CrewMember[];
  episode_number: number;
  guest_stars: GuestStar[];
  name: string;
  overview: string;
  id: number;
  production_code: string;
  runtime: number;
  season_number: number;
  still_path: string;
  vote_average: number;
  vote_count: number;
}

export interface SimpleShowSeason {
  air_date: string; // Simple Date, no timestamp
  episode_count: number;
  id: number;
  name: string;
  overview: string;
  poster_path: string;
  season_number: number;
  vote_average: number;
}

export interface ShowSeason extends SimpleShowSeason {
  _id: string;
  episodes: (ShowEpisode & { show_id: number })[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface ProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface SpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

export interface MovieDetails {
  adult: boolean;
  backdrop_path: string;
  belongs_to_collection: string | null;
  budget: number;
  genres: Genre[];
  homepage: string | null;
  id: number;
  imdb_id: string | null;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  release_date: string; // Format: YYYY-MM-DD
  revenue: number;
  runtime: number | null;
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string | null;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

export interface ExternalIds {
  id: number;
  imdb_id: string | null;
  freebase_mid: string | null;
  freebase_id: string | null;
  tvdb_id: number | null;
  tvrage_id: number | null;
  wikidata_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

export interface MovieTranslations {
  translations: {
    iso_639_1: string;
    name: string;
    english_name: string;
    data: {
      title: string;
      overview: string;
      tagline: string;
      runtime: number;
    };
  }[];
}

export interface MovieImages {
  backdrops?: Image[];
  logos?: Image[];
  posters?: Image[];
}

export interface WithMovieTranslations {
  translations: MovieTranslations;
}

export interface WithMovieImages {
  images: MovieImages;
}

export interface TVShowDetails {
  adult: boolean;
  backdrop_path: string;
  created_by: CrewMember[]; // High chance of being empty
  episode_run_time: number[]; // High chance of being empty
  first_air_date: string; // Format: YYYY-MM-DD
  genres: Genre[];
  homepage: string;
  id: number;
  in_production: boolean;
  languages: string[];
  last_air_date: string; // Format: YYYY-MM-DD
  last_episode_to_air: ShowEpisode;
  name: string;
  next_episode_to_air: string;
  networks: ProductionCompany[];
  number_of_episodes: number;
  number_of_seasons: number;
  origin_country: string[];
  original_language: string;
  original_name: string;
  overview: string;
  popularity: number;
  poster_path: string;
  production_companies: Array<{
    id: number;
    name: string;
    logo_path: string;
  }>;
  seasons: SimpleShowSeason[];
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
  type: string;
  vote_average: number;
  vote_count: number;
}

export interface TVShowTranslations {
  translations: {
    iso_3166_1: string;
    iso_639_1: string;
    name: string;
    english_name: string;
    data: {
      name: string;
      overview: string;
      homepage: string;
      tagline: string;
    };
  }[];
}

export interface WithExternalIds {
  external_ids: ExternalIds;
}
export interface WithTVShowTranslations {
  translations: TVShowTranslations;
}

/**
 * Response structure for TMDB Changes API
 */
export interface ChangesResponse {
  results: {
    id: number;
    adult?: boolean; // only for movies
  }[];
  page: number;
  total_pages: number;
  total_results: number;
}

/**
 * Change item from Changes API
 */
export interface ChangeItem {
  id: number;
  adult?: boolean; // only present for movies
}

/**
 * Result containing all changes from a specific timestamp
 */
export interface ChangeResult {
  items: ChangeItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface MovieSummary {
  adult: boolean;
  backdrop_path: string;
  genre_ids: number[];
  id: number;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string;
  release_date: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

export interface MovieDetailsResponse {
  page: number;
  results: MovieSummary[];
  total_pages: number;
  total_results: number;
}

export interface MovieMediaSummary extends Omit<MovieSummary, "genre_ids"> {
  genres: string[];
  _type: "movie";
}

export interface TVShowSummary {
  backdrop_path: string;
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string;
  media_type: string;
  adult: boolean;
  original_language: string;
  genre_ids: number[];
  popularity: number;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  origin_country: string[];
}

export interface TVShowMediaSummary extends Omit<TVShowSummary, "genre_ids"> {
  genres: string[];
  _type: "tv";
}

export type MediaSummary = MovieMediaSummary | TVShowMediaSummary;

export interface MediaSummaryList {
  page: number;
  results: MediaSummary[];
  total_pages: number;
  total_results: number;
}
