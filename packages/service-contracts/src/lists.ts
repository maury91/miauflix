import { call, contract } from '@miauflix/contract';

export type ListScope = 'public' | 'personal';

export interface ListServiceDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  provider: string;
  scope: ListScope;
  requiresConnection: boolean;
  rank?: number;
}

export interface ListServiceDefinitionsPage {
  results: ListServiceDefinition[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

/** At least one id is present. */
export interface ExternalMediaIds {
  trakt?: number;
  tmdb?: number;
  imdb?: string;
}

export interface ExternalMediaRef {
  mediaType: 'movie' | 'tv';
  ids: ExternalMediaIds;
}

export interface ListItem {
  key: string;
  rank: number;
  media: ExternalMediaRef;
}

export interface ListServicePage {
  listId: string;
  page: number;
  totalPages: number;
  totalItems: number;
  items: ListItem[];
}

export interface ProviderAuthorization {
  authorizationId: string;
  verificationUrl: string;
  userCode: string;
  /** ISO date-time. */
  expiresAt: string;
  interval: number;
}

export interface ProviderAssociation {
  connected: boolean;
  provider: string;
  accountId: string | null;
  username: string | null;
}

export type ConnectionResult =
  | { state: 'pending' }
  | { state: 'connected'; association: ProviderAssociation }
  | { state: 'denied' | 'expired' | 'invalid' };

export interface ListStatusDetails {
  provider: string;
  connectedAccounts: number;
  cachedLists: number;
}

export type PlaybackRef =
  | { kind: 'movie'; mediaId: number }
  | { kind: 'episode'; showMediaId: number; seasonNumber: number; episodeNumber: number };

/** `positionSeconds` never exceeds `durationSeconds`. */
export interface PlaybackProgress {
  playable: PlaybackRef;
  positionSeconds: number;
  durationSeconds: number;
  state: 'playing' | 'paused' | 'completed';
}

export interface PlaybackEntry extends PlaybackProgress {
  /** ISO date-time with offset. */
  updatedAt: string;
  nextEpisode?: true;
}

/** Most definitions a popular-lists page returns. */
export const MAX_POPULAR_PAGE_SIZE = 20;

export const lists = contract('lists', '2.0', {
  definitions: call<{ subjectId?: string }, ListServiceDefinition[]>(),
  popularDefinitions: call<
    { page: number; limit: number },
    ListServiceDefinitionsPage,
    'bad_request'
  >(),
  page: call<{ listId: string; page: number; subjectId?: string }, ListServicePage, 'not_found'>(),

  beginTraktConnection: call<{ subjectId: string }, ProviderAuthorization>(),
  checkTraktConnection: call<{ subjectId: string; authorizationId: string }, ConnectionResult>(),
  traktAssociation: call<{ subjectId: string }, ProviderAssociation>(),
  disconnectTrakt: call<{ subjectId: string }, void>(),

  /** Queues the update for export; resolves whether an account is connected. */
  syncPlayback: call<{ subjectId: string; progress: PlaybackProgress }, boolean>(),
  playback: call<{ subjectId: string }, PlaybackEntry[]>(),
  /** Resolves false when the user has no connected account. */
  syncWatchlist: call<
    { subjectId: string; mediaType: 'movie' | 'tv'; mediaId: number; operation: 'add' | 'remove' },
    boolean
  >(),
});

export type Lists = typeof lists;
