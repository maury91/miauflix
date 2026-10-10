import { nextPreloadSequence } from '@features/preload/lib/intent-client';
import type { ProgressRequest } from '@miauflix/backend';
import { API_URL } from '@shared/config/constants';

const MAP_COALESCE_MS = 50;

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

export interface RealtimeFocus {
  type: 'focus';
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

  constructor(
    private readonly session: string,
    private readonly clientId: string,
    private readonly onStatus: (message: RealtimeStatusMessage) => void,
    private readonly onConnectionChange?: (ready: boolean) => void
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
      if (isReady(message)) {
        this.ready = true;
        this.onConnectionChange?.(true);
        this.refreshLatestSequences();
        this.sendLatest();
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
