import { call, contract, event, stream } from '@miauflix/contract';
import type {
  AudioCodec,
  Language,
  Quality,
  Source,
  VideoCodec,
} from '@miauflix/source-metadata-extractor';

export interface SourceMediaRef {
  kind: 'movie' | 'show';
  tmdbId: number;
  imdbId: string | null;
  tvdbId?: number | null;
  title: string;
  originalTitle?: string;
  year?: number | null;
  releaseDate?: string | null;
  /** Treat as anime; the sources service also recognises anime from its own mapping. */
  isAnime?: boolean;
}
export interface SourceSearchRequest {
  media: SourceMediaRef;
  season?: number;
  episode?: number;
  airDate?: string | null;
  purpose: 'interactive' | 'background';
  /** Providers already known to have nothing; the planner skips them unless stale. */
  skipProviders?: string[];
}
export type MatchedBy = 'imdb' | 'tmdb' | 'tvdb' | 'anidb' | 'anilist' | 'title';
export type Accuracy = 'high' | 'medium' | 'low';
export interface SourceCandidate {
  hash: string; // lowercase 40-hex (v1) or 64-hex (v2), validated
  magnetLink: string; // built with merged trackers
  releaseName: string;
  size: number; // bytes
  broadcasters: number; // seeders
  watchers: number; // leechers
  uploadDate: string; // ISO
  provider: string; // provider id, persisted into content_source.source
  providerKind: 'cardigann' | 'torznab' | 'http';
  matchedBy: MatchedBy;
  accuracy: Accuracy;
  quality: Quality | null;
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec[];
  language: Language[];
  source: Source | null;
  bitrate: number;
  score: number;
  season?: number;
  episode?: number;
  absoluteEpisode?: number;
  batch?: boolean; // season/range pack
  release?: 'best' | 'alt'; // SeaDex
  /**
   * Other names the files of an anime release may give the searched episode: the episode within
   * its cour (`{season: 2, episode: 7}`), TVDB's numbering, or a number counted from the show's
   * first episode (`{episode: 31}`, no season).
   */
  episodeAliases?: { season?: number; episode: number }[];
  files?: string[];
  /** Opaque id the service resolves in torrentFile(); never a raw URL to the backend. */
  fileRef?: string;
  trailerCode?: string; // only some indexers give one
}
export type SourceSearchItem =
  | { type: 'candidate'; candidate: SourceCandidate }
  | {
      type: 'summary';
      providersSearched: string[];
      providersFailed: string[];
      providersSkipped: string[]; // budget/cooldown/capability
      complete: boolean; // every eligible enabled provider answered (successfully or empty)
      retryAfter: string | null; // ISO; when a background re-search is worthwhile
    };

export interface ProviderView {
  id: string;
  name: string;
  /** What the indexer's definition says it is; null when it has none. */
  description: string | null;
  kind: SourceCandidate['providerKind'];
  repositoryId: string | null;
  version: string | null;
  enabled: boolean;
  priority: number;
  caps: { movie: string[]; tv: string[]; anime: string[] };
  requiresFlareSolverr: boolean;
  settingsSchema: ProviderSetting[];
  settings: Record<string, string | boolean>;
  health: {
    state: 'ok' | 'degraded' | 'cooldown' | 'disabled';
    cooldownUntil: string | null;
    lastError: string | null;
    lastSuccessAt: string | null;
  };
  usage: { today: number; dailyBudget: number | null; perMinute: number };
}
export interface ProviderSetting {
  name: string;
  type: 'text' | 'password' | 'checkbox' | 'select';
  label: string;
  default?: string | boolean;
  options?: Record<string, string>;
}
export interface RepositoryView {
  id: string;
  url: string;
  name: string | null;
  builtIn: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  providerCount: number;
}

/** An installable Jackett indexer, as last read from the synced definition list. */
export interface CardigannDefinitionEntry {
  id: string;
  /** Which configured definition source it came from (key and readable name). */
  source: string;
  sourceLabel: string;
  name: string | null;
  language: string | null;
  /** `public`, `private` or `semi-private`; null until the definition has been read. */
  type: string | null;
  installed: boolean;
  /** `pending` and `failed` entries have not been read yet; their capabilities are unknown. */
  status: 'ready' | 'pending' | 'failed';
  supported: boolean;
  /** Why it cannot be added (needs an account, uses an unsupported feature, could not be read). */
  reason: string | null;
  supports: {
    imdb: boolean;
    tmdb: boolean;
    tvdb: boolean;
    movies: boolean;
    tv: boolean;
    anime: boolean;
  };
  requiresFlareSolverr: boolean;
}
export interface CardigannCatalogQuery {
  /** Matches the id or name. */
  query?: string;
  /** Only indexers from this definition source (a key from the sync status). */
  source?: string;
  /** Each flag, when true, keeps only indexers that support it. */
  imdb?: boolean;
  tmdb?: boolean;
  tvdb?: boolean;
  movies?: boolean;
  tv?: boolean;
  anime?: boolean;
  publicOnly?: boolean;
  /** Hide indexers Miauflix cannot use. */
  supportedOnly?: boolean;
  offset: number;
  /** 0 returns only the total and the sync status. */
  limit: number;
}
export interface CardigannSyncStatus {
  lastSyncAt: string | null;
  lastError: string | null;
  syncing: boolean;
  total: number;
  ready: number;
  pending: number;
  failed: number;
  /** What the last run that found changes did. */
  lastChange: { added: number; updated: number; removed: number; failed: number } | null;
  intervalMinutes: number;
  /** One entry per configured definition source. */
  sources: {
    key: string;
    label: string;
    total: number;
    lastSyncAt: string | null;
    lastError: string | null;
  }[];
}
export interface CardigannCatalog {
  entries: CardigannDefinitionEntry[];
  /** Matches for the query, before paging. */
  total: number;
  sync: CardigannSyncStatus;
}

export const sources = contract('sources', '1.3', {
  search: stream<SourceSearchRequest, SourceSearchItem, 'vpn_required'>(),
  /** Bytes of the .torrent (base64), or null. Tries fileRef → itorrents → torrage. */
  torrentFile: call<{ hash: string; fileRef?: string }, string | null, 'vpn_required'>(),
  providers: call<void, ProviderView[]>({ since: 1 }),
  updateProvider: call<
    {
      id: string;
      enabled?: boolean;
      priority?: number;
      settings?: Record<string, string | boolean>;
    },
    ProviderView,
    'not_found' | 'bad_request'
  >({ since: 1 }),
  reorderProviders: call<{ ids: string[] }, ProviderView[], 'bad_request'>({ since: 1 }),
  testProvider: call<{ id: string }, { success: boolean; message: string }, 'not_found'>({
    since: 1,
  }),
  repositories: call<void, RepositoryView[]>({ since: 1 }),
  addRepository: call<{ url: string }, RepositoryView, 'bad_request'>({ since: 1 }),
  removeRepository: call<{ id: string }, void, 'not_found' | 'bad_request'>({ since: 1 }),
  refreshRepository: call<{ id: string }, RepositoryView, 'not_found' | 'bad_request'>({
    since: 1,
  }),
  providersChanged: event<{ at: string }>({ since: 1 }),
  /** The synced Jackett definition list, filtered and paged. */
  cardigannDefinitions: call<CardigannCatalogQuery, CardigannCatalog, 'bad_request'>({ since: 2 }),
  /** Starts a sync now (it keeps running after this returns) and reports the current status. */
  syncCardigannDefinitions: call<void, CardigannSyncStatus>({ since: 3 }),
  addCardigannProvider: call<{ id: string; source?: string }, ProviderView, 'bad_request'>({
    since: 2,
  }),
  addTorznabProvider: call<
    { name: string; baseUrl: string; apiKey?: string },
    ProviderView,
    'bad_request'
  >({ since: 2 }),
  /** Removes a provider the admin added themselves (not one owned by a repository). */
  removeProvider: call<{ id: string }, void, 'not_found' | 'bad_request'>({ since: 2 }),
});
export type Sources = typeof sources;
