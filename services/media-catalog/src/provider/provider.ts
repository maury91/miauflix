import type { MediaType } from '../types';

/**
 * Catalog provider abstraction — the swap point for future catalog backends.
 *
 * Implementations turn their upstream catalog into these provider-agnostic records:
 * - `mediaId` is the catalog's identifier (opaque to this service)
 * - image paths are ALREADY completed to absolute URLs
 * - translations carry the provider's raw per-language text
 *
 * Everything downstream (storage, normalization, freshness, HTTP contract) only
 * sees these shapes, so adding a provider never touches the rest of the service.
 */

export interface ProviderTranslation {
  language: string;
  /** Movie title or show name in `language`. */
  title: string;
  overview: string;
  tagline: string;
}

export interface ProviderMovie {
  mediaId: number;
  imdbId: string | null;
  title: string;
  overview: string;
  tagline: string;
  /** YYYY-MM-DD */
  releaseDate: string;
  runtime: number;
  poster: string;
  backdrop: string;
  logo: string;
  genreIds: number[];
  popularity: number;
  rating: number;
  translations: ProviderTranslation[];
}

export interface ProviderSeasonSummary {
  /** Catalog id of the season itself. */
  mediaId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  /** Absolute URL, '' when absent. */
  poster: string;
}

export interface ProviderEpisode {
  mediaId: number;
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  /** Absolute URL, '' when absent. */
  still: string;
}

export interface ProviderTVShow {
  mediaId: number;
  imdbId: string | null;
  name: string;
  overview: string;
  tagline: string;
  /** YYYY-MM-DD */
  firstAirDate: string;
  status: string;
  type: string;
  inProduction: boolean;
  poster: string;
  backdrop: string;
  logo: string;
  genreIds: number[];
  episodeRunTime: number[];
  popularity: number;
  rating: number;
  seasons: ProviderSeasonSummary[];
  translations: ProviderTranslation[];
}

export interface ProviderSeason extends ProviderSeasonSummary {
  tvMediaId: number;
  episodes: ProviderEpisode[];
}

export interface ProviderGenre {
  id: number;
  name: string;
}

export interface ProviderChangesPage {
  page: number;
  totalPages: number;
  /** Media ids changed in this page. */
  items: number[];
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export interface CatalogProvider {
  /** Identifier announced in /status (e.g. 'tmdb'). */
  readonly name: string;

  /** Live probe used by the configuration test / green-flag activation. */
  test(): Promise<boolean>;

  /** Full movie details incl. translations. Null when unknown to the catalog. */
  getMovie(mediaId: number): Promise<ProviderMovie | null>;

  /** Full tv show details incl. season summaries and translations. */
  getTVShow(mediaId: number): Promise<ProviderTVShow | null>;

  /** Season with episodes. */
  getSeason(tvMediaId: number, seasonNumber: number): Promise<ProviderSeason | null>;

  resolveExternal(ref: {
    mediaType: MediaType;
    ids: { tmdb?: number; imdb?: string };
  }): Promise<number | null>;

  /** Merged genre set for the language (movie + tv). */
  getGenres(language: string): Promise<ProviderGenre[]>;

  /** Pages of changed movie ids between the two dates. */
  changedMovies(startDate: Date, endDate: Date): AsyncGenerator<ProviderChangesPage>;

  /** Pages of changed tv show ids between the two dates. */
  changedTVShows(startDate: Date, endDate: Date): AsyncGenerator<ProviderChangesPage>;

  /** Season numbers of a tv show touched by upstream changes. */
  seasonChanges(mediaId: number): Promise<number[]>;
}
