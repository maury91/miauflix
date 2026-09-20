export interface MovieRow {
  media_id: number;
  imdb_id: string | null;
  title: string;
  overview: string;
  tagline: string;
  release_date: string;
  runtime: number;
  poster: string;
  backdrop: string;
  logo: string;
  popularity: number;
  rating: number;
  details_synced_at: number | null;
}
export interface TVShowRow {
  media_id: number;
  imdb_id: string | null;
  name: string;
  overview: string;
  tagline: string;
  first_air_date: string;
  poster: string;
  backdrop: string;
  status: string;
  type: string;
  in_production: number;
  episode_run_time: string;
  popularity: number;
  rating: number;
  details_synced_at: number | null;
}
export interface SeasonRow {
  media_id: number;
  tv_media_id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  poster: string | null;
  synced: number;
  episodes_synced_at: number | null;
}
export interface EpisodeRow {
  media_id: number;
  season_media_id: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  still: string | null;
}
export interface TranslationRow {
  language: string;
  title: string;
  overview: string;
  tagline: string;
}
export interface UpsertableMovie {
  mediaId: number;
  imdbId: string | null;
  title: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  poster: string;
  backdrop: string;
  logo: string;
  genreIds: number[];
  popularity: number;
  rating: number;
  translations: Array<{ language: string; title: string; overview: string; tagline: string }>;
}
export interface UpsertableTVShow {
  mediaId: number;
  imdbId: string | null;
  name: string;
  overview: string;
  tagline: string;
  firstAirDate: string;
  status: string;
  type: string;
  inProduction: boolean;
  poster: string;
  backdrop: string;
  genreIds: number[];
  episodeRunTime: number[];
  popularity: number;
  rating: number;
  seasons: Array<{
    mediaId: number;
    seasonNumber: number;
    name: string;
    overview: string;
    airDate: string | null;
    poster: string;
  }>;
  translations: Array<{ language: string; title: string; overview: string; tagline: string }>;
}
export interface UpsertableSeason {
  mediaId: number;
  tvMediaId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  poster: string;
  episodes: Array<{
    mediaId: number;
    episodeNumber: number;
    name: string;
    overview: string;
    airDate: string | null;
    still: string;
  }>;
}
export const SYNC_STATE_MOVIES = 'movies';
export const SYNC_STATE_TV_SHOWS = 'tv_shows';
const IN_CLAUSE_BATCH = 500;
export const inBatches = (ids: number[]): number[][] => {
  const batches: number[][] = [];
  for (let index = 0; index < ids.length; index += IN_CLAUSE_BATCH)
    batches.push(ids.slice(index, index + IN_CLAUSE_BATCH));
  return batches;
};
