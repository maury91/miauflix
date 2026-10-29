import { nextPreloadSequence } from '@features/preload/lib/intent-client';
import type {
  CreatePlaybackSessionResponse,
  ProgressRequest,
  SearchClientMessage,
  SearchServerMessage,
} from '@miauflix/backend';
import {
  type ArtworkUpdate,
  artworkUpdateSchema,
  type MediaRef,
} from '@miauflix/service-contracts/catalog/v1';
import { API_URL } from '@shared/config/constants';

const MAP_COALESCE_MS = 50;
const ARTWORK_BATCH_SIZE = 50;
const MAX_ARTWORK_SUBSCRIPTIONS = 5_000;

export type RealtimeMediaRef =
  | { kind: 'movie'; mediaId: number }
  | { kind: 'show'; mediaId: number }
  | { kind: 'episode'; showMediaId: number; seasonNumber: number; episodeNumber: number };

export type RealtimeStatusMessage =
  | {
      type: 'source-status';
      mediaId: number;
      media: RealtimeMediaRef;
      status: string;
      sourceId: number | null;
      quality: string | null;
      source: string | null;
      focusSequence: number;
    }
  | {
      type: 'warmup';
      mediaId: number;
      media: RealtimeMediaRef;
      playable: RealtimeMediaRef;
      status: string;
      loaded: number | null;
      verifiedBytes: number | null;
      targetBytes: number | null;
      statusDescription: string;
      focusSequence: number;
    };

export type RealtimeSourceAvailability = 'available' | 'pending' | 'unavailable';

/**
 * Source news for a movie or episode: which candidate a starting playback is trying, or
 * whether any real source is left (`unavailable` once every one proved fake).
 */
export type RealtimeSourceMessage =
  | {
      type: 'source-attempt';
      playable: RealtimeMediaRef;
      position: number;
      total: number;
    }
  | {
      type: 'source-availability';
      playable: RealtimeMediaRef;
      mediaId: number;
      availability: RealtimeSourceAvailability;
    };

/** A playback's background probe result: switch delivery, or start a new session. */
export interface RealtimePlaybackDelivery {
  type: 'playback-delivery';
  playbackId: string;
  update:
    | {
        type: 'delivery';
        delivery: NonNullable<CreatePlaybackSessionResponse['delivery']>;
        streamUrl: string;
      }
    | { type: 'recreate'; reason: string };
}

export interface RealtimeFocus {
  type: 'focus';
  subtitleLanguage?: string;
  clientSequence: number;
  navigationRevision: number;
  view: 'browse' | 'details' | 'player';
  media: RealtimeMediaRef | null;
}

export interface RealtimeMap {
  type: 'map';
  clientSequence: number;
  navigationRevision: number;
  center: [number, number] | null;
  mediaIds: Array<Array<RealtimeMediaRef | null>>;
  visible?: Array<[number, number]>;
}

function socketUrl(): string {
  const url = new URL(API_URL, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname =
    basePath === '/api' || basePath.endsWith('/api')
      ? `${basePath}/realtime`
      : `${basePath}/api/realtime`;
  url.search = '';
  return url.toString();
}

/** One reconnecting socket per authenticated browser tab. Playback progress also uses this channel. */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private retryTimer: number | null = null;
  private retryMs = 500;
  private visible = true;
  private ready = false;
  private latestFocus: RealtimeFocus | null = null;
  private latestMap: RealtimeMap | null = null;
  private heartbeatTimer: number | null = null;
  private mapTimer: number | null = null;
  private artworkRefs = new Map<string, MediaRef>();
  private sentArtworkRefs = new Map<string, MediaRef>();
  /** Search messages waiting for the socket, at most one per message type. */
  private pendingSearch = new Map<SearchClientMessage['type'], SearchClientMessage>();
  /** The search to replay after a reconnect, since its answer may have been lost. */
  private latestSearch: Extract<SearchClientMessage, { type: 'search' }> | null = null;

  constructor(
    private readonly session: string,
    private readonly clientId: string,
    private readonly onStatus: (message: RealtimeStatusMessage) => void,
    private readonly onConnectionChange?: (ready: boolean) => void,
    private readonly onArtworkUpdate?: (update: ArtworkUpdate) => void,
    private readonly onPlaybackDelivery?: (message: RealtimePlaybackDelivery) => void,
    private readonly onSearch?: (message: SearchServerMessage) => void,
    private readonly onSource?: (message: RealtimeSourceMessage) => void
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
    this.heartbeatTimer = window.setInterval(() => this.heartbeat(), 5_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    if (this.mapTimer !== null) window.clearTimeout(this.mapTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
    this.mapTimer = null;
    this.ready = false;
    this.onConnectionChange?.(false);
    this.socket?.close(1000, 'Client stopped');
    this.socket = null;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      // A hidden tab releases its lease. Give the resumed interest fresh
      // sequence numbers so the gateway accepts it as a new lease.
      if (this.latestFocus) {
        this.latestFocus = { ...this.latestFocus, clientSequence: nextPreloadSequence() };
      }
      if (this.latestMap) {
        this.latestMap = { ...this.latestMap, clientSequence: nextPreloadSequence() };
      }
      this.sendLatest();
      this.syncArtworkRefs();
      this.heartbeat();
    } else {
      this.heartbeat();
    }
  }

  publishFocus(input: Omit<RealtimeFocus, 'type' | 'clientSequence'>): void {
    this.latestFocus = {
      type: 'focus',
      clientSequence: nextPreloadSequence(),
      ...input,
    };
    this.sendFocus();
  }

  publishMap(input: Omit<RealtimeMap, 'type' | 'clientSequence'>): void {
    this.latestMap = {
      type: 'map',
      clientSequence: nextPreloadSequence(),
      ...input,
    };
    if (this.mapTimer === null) {
      this.mapTimer = window.setTimeout(() => {
        this.mapTimer = null;
        this.sendMap();
      }, MAP_COALESCE_MS);
    }
  }

  /** Replace the media identities retained by loaded list and detail caches. */
  setArtworkSubscriptions(refs: MediaRef[]): void {
    const next = new Map<string, MediaRef>();
    for (const ref of refs.slice(0, MAX_ARTWORK_SUBSCRIPTIONS)) {
      next.set(`${ref.mediaType}:${ref.mediaId}`, ref);
    }
    this.artworkRefs = next;
    this.syncArtworkRefs();
  }

  /** Send a search request; messages sent while disconnected go out once the socket is ready. */
  sendSearch(message: SearchClientMessage): void {
    // Replays must not record the search as a recent again.
    if (message.type === 'search') this.latestSearch = { ...message, commit: false };
    if (this.ready && this.socket) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    this.pendingSearch.set(message.type, message);
  }

  /** Send durable playback progress through the authenticated socket when it is available. */
  publishProgress(progress: ProgressRequest): boolean {
    if (!this.ready || !this.socket || !this.visible) return false;
    try {
      this.socket.send(
        JSON.stringify({
          type: 'progress',
          clientSequence: nextPreloadSequence(),
          ...progress,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    // jsdom and older embedded clients may not expose WebSocket. HTTP intent
    // remains the fallback in that case.
    if (typeof WebSocket === 'undefined') return;
    const socket = new WebSocket(socketUrl());
    this.socket = socket;
    this.sentArtworkRefs.clear();
    socket.onopen = () => {
      this.retryMs = 500;
      socket.send(
        JSON.stringify({ type: 'authenticate', session: this.session, clientId: this.clientId })
      );
    };
    socket.onmessage = event => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (
        isStatusMessage(message) &&
        (!this.latestFocus || message.focusSequence >= this.latestFocus.clientSequence)
      )
        this.onStatus(message);
      if (isArtworkUpdate(message)) this.onArtworkUpdate?.(message);
      if (isPlaybackDelivery(message)) this.onPlaybackDelivery?.(message);
      if (isSearchMessage(message)) this.onSearch?.(message);
      if (isSourceMessage(message)) this.onSource?.(message);
      if (isReady(message)) {
        this.ready = true;
        this.onConnectionChange?.(true);
        this.refreshLatestSequences();
        this.sendLatest();
        this.syncArtworkRefs();
        this.flushSearch();
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      this.onConnectionChange?.(false);
      if (!this.stopped) this.scheduleRetry();
    };
    socket.onerror = () => socket.close();
  }

  private flushSearch(): void {
    if (this.latestSearch && !this.pendingSearch.has('search'))
      this.pendingSearch.set('search', this.latestSearch);
    const pending = [...this.pendingSearch.values()];
    this.pendingSearch.clear();
    for (const message of pending) this.socket?.send(JSON.stringify(message));
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(
      () => {
        this.retryTimer = null;
        this.connect();
      },
      this.retryMs + Math.floor(Math.random() * 250)
    );
    this.retryMs = Math.min(8_000, this.retryMs * 2);
  }

  private sendLatest(): void {
    if (!this.ready || !this.socket || !this.visible) return;
    if (this.mapTimer !== null) {
      window.clearTimeout(this.mapTimer);
      this.mapTimer = null;
    }
    this.sendFocus();
    this.sendMap();
  }

  private sendFocus(): void {
    if (!this.ready || !this.socket || !this.visible || !this.latestFocus) return;
    this.socket.send(JSON.stringify(this.latestFocus));
  }

  private sendMap(): void {
    if (!this.ready || !this.socket || !this.visible || !this.latestMap) return;
    this.socket.send(JSON.stringify(this.latestMap));
  }

  private syncArtworkRefs(): void {
    const removed = [...this.sentArtworkRefs]
      .filter(([key]) => !this.artworkRefs.has(key))
      .map(([, ref]) => ref);
    const added = [...this.artworkRefs]
      .filter(([key]) => !this.sentArtworkRefs.has(key))
      .map(([, ref]) => ref);
    this.sendArtworkRefs('artwork-unsubscribe', removed);
    this.sendArtworkRefs('artwork-subscribe', added);
  }

  private sendArtworkRefs(
    type: 'artwork-subscribe' | 'artwork-unsubscribe',
    refs: MediaRef[]
  ): void {
    if (!this.ready || !this.socket || !this.visible) return;
    for (let offset = 0; offset < refs.length; offset += ARTWORK_BATCH_SIZE) {
      const items = refs.slice(offset, offset + ARTWORK_BATCH_SIZE);
      this.socket.send(JSON.stringify({ type, items }));
      for (const ref of items) {
        const key = `${ref.mediaType}:${ref.mediaId}`;
        if (type === 'artwork-subscribe') this.sentArtworkRefs.set(key, ref);
        else this.sentArtworkRefs.delete(key);
      }
    }
  }

  private refreshLatestSequences(): void {
    if (this.latestFocus) {
      this.latestFocus = { ...this.latestFocus, clientSequence: nextPreloadSequence() };
    }
    if (this.latestMap) {
      this.latestMap = { ...this.latestMap, clientSequence: nextPreloadSequence() };
    }
  }

  private heartbeat(): void {
    if (!this.ready || !this.socket) return;
    this.socket.send(
      JSON.stringify({
        type: 'interest-heartbeat',
        clientSequence: nextPreloadSequence(),
        visible: this.visible,
      })
    );
  }
}

function isReady(value: unknown): value is { type: 'ready' } {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'ready'
  );
}

function isStatusMessage(value: unknown): value is RealtimeStatusMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'source-status' || type === 'warmup';
}

function isSourceMessage(value: unknown): value is RealtimeSourceMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const playable = candidate['playable'] as { kind?: unknown } | undefined;
  if (playable?.kind !== 'movie' && playable?.kind !== 'episode') return false;
  if (candidate['type'] === 'source-attempt')
    return typeof candidate['position'] === 'number' && typeof candidate['total'] === 'number';
  return (
    candidate['type'] === 'source-availability' &&
    (candidate['availability'] === 'available' ||
      candidate['availability'] === 'pending' ||
      candidate['availability'] === 'unavailable')
  );
}

function isPlaybackDelivery(value: unknown): value is RealtimePlaybackDelivery {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RealtimePlaybackDelivery>;
  return (
    candidate.type === 'playback-delivery' &&
    typeof candidate.playbackId === 'string' &&
    (candidate.update?.type === 'delivery' || candidate.update?.type === 'recreate')
  );
}

const SEARCH_MESSAGE_TYPES = new Set([
  'search-results',
  'search-details',
  'search-error',
  'search-genres',
  'search-recents',
]);

function isSearchMessage(value: unknown): value is SearchServerMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!SEARCH_MESSAGE_TYPES.has(candidate['type'] as string)) return false;
  return candidate['type'] === 'search-recents' || candidate['type'] === 'search-genres'
    ? Array.isArray(candidate['items'])
    : typeof candidate['requestId'] === 'number';
}

function isArtworkUpdate(value: unknown): value is ArtworkUpdate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['type'] !== 'artwork-update') return false;
  return artworkUpdateSchema.safeParse(candidate).success;
}
