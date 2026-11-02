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
  isAnime?: boolean; // phase 5
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
  providerKind: 'native' | 'cardigann' | 'torznab' | 'http';
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
  absoluteEpisode?: number; // phase 5
  batch?: boolean; // season/range pack
  release?: 'best' | 'alt'; // SeaDex, phase 5
  files?: string[];
  /** Opaque id the service resolves in torrentFile(); never a raw URL to the backend. */
  fileRef?: string;
  trailerCode?: string; // YTS only
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

export const sources = contract('sources', '1.1', {
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
});
export type Sources = typeof sources;
