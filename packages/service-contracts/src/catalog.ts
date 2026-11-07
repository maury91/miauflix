import { call, contract, event } from '@miauflix/contract';

export type MediaType = 'movie' | 'tv';

export interface MediaRef {
  mediaType: MediaType;
  mediaId: number;
}

export interface LocalizedGenre {
  id: number;
  name: string;
}

/** Normalized focal point of a backdrop, both axes in [0, 1]. */
export interface BackdropFocus {
  x: number;
  y: number;
}

export type ArtworkPriority = 'focused' | 'visible' | 'returned' | 'prefetch';
export type ArtworkStatus = 'pending' | 'ready' | 'failed';

export interface ArtworkUpdate {
  mediaType: MediaType;
  mediaId: number;
  backdrop: string;
  logo: string;
  heroLogo: string;
  artworkRevision: number;
  cardLogoStatus: ArtworkStatus;
  heroLogoStatus: ArtworkStatus;
}

interface ArtworkFields {
  poster: string;
  backdrop: string;
  logo: string;
  heroLogo?: string;
  artworkRevision?: number;
  cardLogoStatus?: ArtworkStatus;
  heroLogoStatus?: ArtworkStatus;
  backdropFocus: BackdropFocus | null;
}

export interface MovieDetail extends ArtworkFields {
  mediaType: 'movie';
  mediaId: number;
  imdbId: string | null;
  title: string;
  overview: string;
  tagline: string;
  releaseDate: string;
  runtime: number;
  genres: LocalizedGenre[];
  popularity: number;
  rating: number;
  detailsSyncedAt: string | null;
}

export interface SeasonSummary {
  mediaId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  poster: string | null;
  episodeCount: number;
  synced: boolean;
  /** The AniList entry this season is, for anime numbered by entry. */
  anilistId?: number | null;
}

export interface TVShowDetail extends ArtworkFields {
  mediaType: 'tv';
  mediaId: number;
  imdbId: string | null;
  name: string;
  overview: string;
  tagline: string;
  firstAirDate: string;
  status: string;
  type: string;
  inProduction: boolean;
  episodeRunTime: number[];
  genres: LocalizedGenre[];
  popularity: number;
  rating: number;
  seasons: SeasonSummary[];
  detailsSyncedAt: string | null;
  /**
   * How seasons are numbered: TMDB's own, or one season per AniList entry (anime TMDB keeps in
   * fewer seasons). Absent from older catalogs, which only number by TMDB.
   */
  seasonLayout?: SeasonLayout;
  /** Changes whenever the numbering does; stored episode numbers must then be renumbered. */
  seasonLayoutVersion?: string | null;
}

export type SeasonLayout = 'tmdb' | 'anilist';

export interface EpisodeDetail {
  mediaId: number;
  episodeNumber: number;
  /** TMDB's season and episode, when the show is numbered by AniList entry. */
  providerSeasonNumber?: number;
  providerEpisodeNumber?: number;
  name: string;
  overview: string;
  airDate: string | null;
  still: string | null;
}

export interface SeasonDetail {
  tvMediaId: number;
  seasonMediaId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  poster: string | null;
  synced: boolean;
  episodes: EpisodeDetail[];
  anilistId?: number | null;
}

/** Where every episode of a show numbered by AniList entry sits, in both numberings. */
export interface EpisodeLayout {
  tvMediaId: number;
  layout: SeasonLayout;
  version: string | null;
  /** Empty for `tmdb`: the numbering is TMDB's. */
  episodes: EpisodeLayoutEntry[];
}
export interface EpisodeLayoutEntry {
  /** TMDB episode id. */
  mediaId: number;
  seasonNumber: number;
  episodeNumber: number;
  providerSeasonNumber: number;
  providerEpisodeNumber: number;
}

export interface MediaSummary {
  mediaType: MediaType;
  mediaId: number;
  title: string;
  overview: string;
  poster: string;
  backdrop: string;
  genreIds: number[];
  releaseDate: string;
  popularity: number;
  rating: number;
}

/**
 * A search genre: a catalog genre id ("28") or a curated shortcut that is not a genre of its own
 * ("anime", until anime comes from MyAnimeList). Validate untrusted input with
 * `SEARCH_GENRE_KEY_PATTERN`.
 */
export type SearchGenreKey = string;
export const SEARCH_GENRE_KEY_PATTERN = /^(?:[1-9]\d{0,9}|anime)$/u;

export interface SearchGenre {
  key: SearchGenreKey;
  name: string;
  /** Catalog titles with this genre; shortcuts report 0. */
  titles: number;
  shortcut: boolean;
}

export interface SearchResponse {
  results: MediaSummary[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface ExternalMediaLookup {
  mediaType: MediaType;
  /** At least one of the two. */
  ids: { tmdb?: number; imdb?: string };
}

export interface ResolvedExternalMedia {
  requested: ExternalMediaLookup;
  media: MediaRef | null;
}

export interface BatchResponse {
  items: Array<MovieDetail | TVShowDetail>;
  missing: MediaRef[];
  errors: Array<{ ref: MediaRef; error: string }>;
}

export interface CatalogStatusDetails {
  provider: string;
  movies: number;
  tvShows: number;
  seasons: number;
  episodes: number;
  lastMovieSync: string | null;
  lastShowSync: string | null;
}

/** Most media refs a batch method accepts. */
export const MAX_BATCH_ITEMS = 50;

export const catalog = contract('catalog', '2.1', {
  getMovie: call<{ mediaId: number; language: string }, MovieDetail, 'not_found'>({ dedupe: true }),
  getShow: call<{ mediaId: number; language: string }, TVShowDetail, 'not_found'>({ dedupe: true }),
  getSeason: call<
    { tvMediaId: number; seasonNumber: number; language: string },
    SeasonDetail,
    'not_found'
  >({ dedupe: true }),
  /** Both numberings of a show's episodes (anime numbered by AniList entry). */
  episodeLayout: call<{ tvMediaId: number }, EpisodeLayout, 'not_found'>({
    dedupe: true,
    since: 1,
  }),
  search: call<{ query: string; page: number; language: string }, SearchResponse>({ dedupe: true }),
  discover: call<{ genre: SearchGenreKey; page: number; language: string }, SearchResponse>({
    dedupe: true,
  }),
  /** Every catalog genre, most titles first, then the search shortcuts. */
  searchGenres: call<{ language: string }, SearchGenre[]>({ dedupe: true }),
  batch: call<
    {
      items: MediaRef[];
      language: string;
      artworkPriority: 'returned' | 'background' | 'prefetch';
    },
    BatchResponse
  >(),
  resolveExternal: call<{ items: ExternalMediaLookup[] }, ResolvedExternalMedia[]>(),

  /** Returns how many items were accepted. */
  queueArtwork: call<{ items: MediaRef[]; priority: ArtworkPriority }, number>(),
  artworkSnapshot: call<{ items: MediaRef[] }, ArtworkUpdate[]>(),
  artwork: event<ArtworkUpdate>(),

  /** Cached or newly computed focus of the title's backdrop. */
  ensureBackdropFocus: call<MediaRef, BackdropFocus, 'not_found' | 'no_backdrop'>(),
  /** Returns how many items were accepted. */
  queueBackdropFocus: call<{ items: MediaRef[] }, number>(),

  /** The titles someone is watching; the host pushes it at boot, possibly before `ready`. */
  setWatching: call<{ mediaIds: number[] }, void>({ ungated: true }),
});

export type Catalog = typeof catalog;

/* ---------- background jobs (Bunqueue) ---------- */

export type CatalogJobName =
  | 'catalog.movie-changes.scan'
  | 'catalog.show-changes.scan'
  | 'catalog.season-sync.seed';

export interface CatalogJobPayloads {
  'catalog.movie-changes.scan': Record<string, never>;
  'catalog.show-changes.scan': Record<string, never>;
  'catalog.season-sync.seed': { tvMediaId?: number; priority?: number };
}

export const CATALOG_JOB_QUEUES: Record<CatalogJobName, string> = {
  'catalog.movie-changes.scan': 'miauflix-catalog-movie-changes',
  'catalog.show-changes.scan': 'miauflix-catalog-show-changes',
  'catalog.season-sync.seed': 'miauflix-catalog-season-sync',
};
