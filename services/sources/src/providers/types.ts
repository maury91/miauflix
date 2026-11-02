import type { TrackerMetadata } from '@miauflix/source-metadata-extractor';

import type { HttpClient } from '../http/http-client';
export type Param =
  | 'q'
  | 'imdbid'
  | 'tmdbid'
  | 'tvdbid'
  | 'season'
  | 'ep'
  | 'anidbAid'
  | 'anidbEid'
  | 'anilistId'
  | 'page';
export interface ProviderCaps {
  movie: Param[];
  tv: Param[];
  anime: Param[];
} // empty array = unsupported
export interface ProviderQuery {
  kind: 'movie' | 'tv' | 'anime';
  q?: string;
  imdbid?: string;
  tmdbid?: number;
  tvdbid?: number;
  season?: number;
  ep?: number;
  anidbAid?: number;
  anidbEid?: number;
  anilistId?: number;
  absoluteEpisode?: number;
  episodeCount?: number;
  titles?: string[];
  page?: number;
}
export interface RawResult {
  season?: number;
  episode?: number;
  absoluteEpisode?: number;
  title: string;
  hash?: string;
  magnet?: string;
  torrentUrl?: string;
  size?: number;
  runtimeMinutes?: number;
  trackerMetadata?: TrackerMetadata;
  type?: string;
  category?: string;
  seeders?: number;
  leechers?: number;
  date?: Date | string;
  imdbid?: string;
  files?: string[];
  trailerCode?: string;
  batch?: boolean;
  release?: 'best' | 'alt';
  anidbFid?: number; // AnimeTosho exact-file marker → accuracy high
}
export interface ProviderPage {
  results: RawResult[];
  hasMore: boolean;
}
export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly kind: 'native' | 'cardigann' | 'torznab' | 'http';
  readonly caps: ProviderCaps;
  readonly rate: { perMinute: number; minIntervalMs: number; dailyBudget: number | null };
  readonly requiresFlareSolverr: boolean;
  readonly maxPages: number; // default 1; TheRARBG season search 3
  search(
    query: ProviderQuery,
    ctx: { signal: AbortSignal; http: HttpClient }
  ): Promise<ProviderPage>;
  test(ctx: {
    signal: AbortSignal;
    http: HttpClient;
  }): Promise<{ success: boolean; message: string }>;
}
