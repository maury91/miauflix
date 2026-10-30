import type { SearchGenreKey } from '@miauflix/contracts';

export type { SearchGenreKey };

/** A title search or a genre shortcut; for genres `query` holds the genre key. */
export type SearchRecentKind = 'genre' | 'query';

export interface SearchRecentDto {
  kind: SearchRecentKind;
  query: string;
  /** What to show: the query itself, or the genre's name. */
  label: string;
  searchedAt: string;
}

/** A genre chip: a catalog genre ("28") or a shortcut such as "anime". */
export interface SearchGenreDto {
  key: SearchGenreKey;
  name: string;
}

/** Card data available as soon as the catalog answers the search. */
export interface SearchResultDto {
  _type: 'movie' | 'tvshow';
  mediaId: number;
  title: string;
  overview: string;
  poster: string;
  backdrop: string;
  releaseDate: string;
  rating: number;
}

/** Details that need a full catalog lookup, delivered after the results. */
export interface SearchResultDetailDto {
  _type: 'movie' | 'tvshow';
  mediaId: number;
  runtime?: number;
  seasonCount?: number;
  logo?: string;
}

export interface SearchPageDto {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SearchResultDto[];
}

/** Realtime messages the client sends to search. */
export type SearchClientMessage =
  | {
      type: 'search';
      requestId: number;
      query?: string;
      genre?: SearchGenreKey;
      page: number;
      language?: string;
      /** Record the search as a recent (explicit submit, chip, or opened result). */
      commit?: boolean;
    }
  | { type: 'search-genres' }
  | { type: 'search-recent-add'; kind: SearchRecentKind; query: string }
  | { type: 'search-recent-remove'; kind: SearchRecentKind; query: string }
  | { type: 'search-recents' };

/** Realtime messages the server sends in reply. */
export type SearchServerMessage =
  | { type: 'search-details'; requestId: number; items: SearchResultDetailDto[] }
  | { type: 'search-error'; requestId: number; message: string }
  | { type: 'search-genres'; items: SearchGenreDto[] }
  | { type: 'search-recents'; items: SearchRecentDto[] }
  | (SearchPageDto & { type: 'search-results'; requestId: number });
