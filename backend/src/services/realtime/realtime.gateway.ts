import type { IncomingMessage, Server as HttpServer } from 'node:http';

import WebSocket, { WebSocketServer } from 'ws';

import type { ConfigService } from '@mytypes/configuration';
import type { MediaIntentRef, PreloadIntentRequest, ReachableIntent } from '@routes/playable.types';
import type { PreloadPreparationSnapshot } from '@routes/preload.types';
import type { ProgressRequest } from '@routes/progress.types';
import type { AuthService } from '@services/auth/auth.service';
import type { PreloadIntentService } from '@services/preload/preload-intent.service';
import type { ProgressService } from '@services/progress/progress.service';

const MAX_MAP_SIDE = 11;
const MAX_MAP_CELLS = MAX_MAP_SIDE * MAX_MAP_SIDE;
const AUTH_TIMEOUT_MS = 5_000;

type Coordinate = [number, number];

type FocusMessage = {
  type: 'focus';
  clientSequence: number;
  navigationRevision: number;
  view: PreloadIntentRequest['view'];
  media: MediaIntentRef | null;
};

type MapMessage = {
  type: 'map';
  clientSequence: number;
  navigationRevision: number;
  center: Coordinate | null;
  mediaIds: Array<Array<MediaIntentRef | null>>;
  visible?: Coordinate[];
};

type HeartbeatMessage = {
  type: 'interest-heartbeat';
  clientSequence: number;
  visible: boolean;
};

type ProgressMessage = ProgressRequest & {
  type: 'progress';
  clientSequence: number;
};

interface ClientState {
  socket: WebSocket;
  request: IncomingMessage;
  userId: string;
  sessionId: string;
  clientId: string;
  focused: MediaIntentRef | null;
  view: PreloadIntentRequest['view'];
  map: MapMessage | null;
  sequence: number;
  focusSequence: number;
  progressChain: Promise<void>;
  authTimer: ReturnType<typeof setTimeout>;
}

interface RealtimeEvent {
  userId: string;
  sessionId: string;
  clientId: string;
  preparation: PreloadPreparationSnapshot | null;
}

/**
 * Public realtime gateway for navigation interest, playback progress, and preparation status.
 * Progress is persisted through the same service used by the HTTP route.
 */
export class RealtimeGateway {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  private readonly clients = new Set<ClientState>();
  private readonly onPreparationChange = (event: RealtimeEvent) => {
    for (const client of this.clients) {
      if (
        client.userId === event.userId &&
        client.sessionId === event.sessionId &&
        client.clientId === event.clientId
      ) {
        this.sendPreparation(client, event.preparation, client.focusSequence);
      }
    }
  };

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly preload: PreloadIntentService,
    private readonly progress: ProgressService
  ) {
    this.server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      this.accept(socket, request);
    });
    this.preload.onChange(this.onPreparationChange);
  }

  attach(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/api/realtime') return;
      if (!this.isAllowedOrigin(request.headers.origin)) {
        socket.destroy();
        return;
      }
      this.server.handleUpgrade(request, socket, head, client => {
        this.server.emit('connection', client, request);
      });
    });
  }

  close(): void {
    for (const client of this.clients) client.socket.close(1001, 'Server shutting down');
    this.clients.clear();
    this.server.close();
    this.preload.offChange(this.onPreparationChange);
  }

  private accept(socket: WebSocket, request: IncomingMessage): void {
    const state = {
      socket,
      request,
      userId: '',
      sessionId: '',
      clientId: '',
      focused: null,
      view: 'browse' as const,
      map: null,
      sequence: 0,
      focusSequence: 0,
      progressChain: Promise.resolve(),
      authTimer: setTimeout(() => socket.close(1008, 'Authentication required'), AUTH_TIMEOUT_MS),
    } satisfies ClientState;
    this.clients.add(state);
    socket.on('message', data => this.handleMessage(state, data.toString()));
    socket.on('close', () => this.remove(state));
    socket.on('error', () => this.remove(state));
  }

  private async handleMessage(state: ClientState, raw: string): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      state.socket.close(1003, 'Invalid JSON');
      return;
    }
    if (!this.isRecord(message) || typeof message.type !== 'string') {
      state.socket.close(1003, 'Invalid message');
      return;
    }
    if (!state.userId) {
      if (message.type !== 'authenticate') {
        state.socket.close(1008, 'Authentication required');
        return;
      }
      await this.authenticate(state, message);
      return;
    }
    try {
      if (message.type === 'focus') {
        if (!this.isFocus(message)) return this.invalid(state, 'Invalid focus');
        if (message.clientSequence <= state.sequence) return;
        state.focused = message.media;
        state.view = message.view;
        state.sequence = Math.max(state.sequence, message.clientSequence);
        state.focusSequence = message.clientSequence;
        const result = this.updateIntent(state, message.clientSequence);
        this.sendPreparation(state, result.preparation, message.clientSequence);
        return;
      }
      if (message.type === 'map') {
        if (!this.isMap(message)) return this.invalid(state, 'Invalid map');
        if (message.clientSequence <= state.sequence) return;
        state.map = message;
        state.sequence = Math.max(state.sequence, message.clientSequence);
        if (state.focused) {
          const result = this.updateIntent(state, message.clientSequence);
          this.sendPreparation(state, result.preparation, state.focusSequence);
        }
        return;
      }
      if (message.type === 'interest-heartbeat') {
        if (!this.isHeartbeat(message)) return this.invalid(state, 'Invalid heartbeat');
        if (message.clientSequence <= state.sequence) return;
        state.sequence = Math.max(state.sequence, message.clientSequence);
        if (!message.visible) {
          state.focused = null;
          state.map = null;
          this.preload.remove(state.userId, state.sessionId, state.clientId);
          return;
        }
        const result = this.updateIntent(state, message.clientSequence);
        this.sendPreparation(state, result.preparation, state.focusSequence);
        return;
      }
      if (message.type === 'progress') {
        if (!this.isProgress(message)) return this.invalid(state, 'Invalid progress');
        if (message.clientSequence <= state.sequence) return;
        state.sequence = Math.max(state.sequence, message.clientSequence);
        state.progressChain = state.progressChain
          .then(async () => {
            await this.progress.update(state.userId, {
              playable: message.playable,
              positionSeconds: message.positionSeconds,
              durationSeconds: message.durationSeconds,
              state: message.state,
            });
            this.send(state, {
              type: 'progress-ack',
              v: 1,
              clientSequence: message.clientSequence,
            });
          })
          .catch(() => state.socket.close(1011, 'Progress update failed'));
        return;
      }
      this.invalid(state, 'Unsupported message');
    } catch {
      state.socket.close(1011, 'Realtime update failed');
    }
  }

  private async authenticate(state: ClientState, message: Record<string, unknown>): Promise<void> {
    if (typeof message.session !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(message.session)) {
      state.socket.close(1008, 'Invalid session');
      return;
    }
    if (typeof message.clientId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(message.clientId)) {
      state.socket.close(1008, 'Invalid client id');
      return;
    }
    const cookieName = `${this.config.get('ACCESS_TOKEN_COOKIE_NAME') ?? '__at'}_${message.session}`;
    const token = this.cookies(state.request.headers.cookie ?? '')[cookieName];
    if (!token) {
      state.socket.close(1008, 'Authentication failed');
      return;
    }
    try {
      const payload = await this.authService.verifyAccessToken(token);
      state.userId = payload.userId;
      state.sessionId = message.session;
      state.clientId = message.clientId;
      clearTimeout(state.authTimer);
      this.send(state, { type: 'ready', v: 1 });
    } catch {
      state.socket.close(1008, 'Authentication failed');
    }
  }

  private updateIntent(state: ClientState, sequence: number) {
    return this.preload.update(state.userId, state.sessionId, state.clientId, {
      sequence,
      view: state.view,
      focused: state.focused,
      reachable: this.reachable(state.map),
    });
  }

  private sendPreparation(
    state: ClientState,
    preparation: PreloadPreparationSnapshot | null,
    focusSequence: number
  ): void {
    if (!preparation) return;
    this.send(state, {
      type: 'source-status',
      v: 1,
      focusSequence,
      mediaId: this.mediaIdFor(preparation.playable),
      media: preparation.playable,
      status: preparation.state,
      sourceId: preparation.source?.id ?? null,
      quality: preparation.source?.quality ?? null,
      source: preparation.source?.sourceType ?? null,
    });
    this.send(state, {
      type: 'warmup',
      v: 1,
      focusSequence,
      mediaId: this.mediaIdFor(preparation.playable),
      media: preparation.playable,
      playable: preparation.playable,
      sourceId: preparation.source?.id ?? null,
      status: preparation.warmup.state,
      loaded: preparation.warmup.progress ?? null,
      verifiedBytes: preparation.warmup.verifiedBytes ?? null,
      targetBytes: preparation.warmup.targetBytes ?? null,
      statusDescription: this.warmupDescription(preparation.warmup.state),
    });
  }

  private reachable(map: MapMessage | null): ReachableIntent[] {
    if (!map) return [];
    const candidates: ReachableIntent[] = [];
    for (let row = 0; row < map.mediaIds.length; row += 1) {
      for (let column = 0; column < map.mediaIds[row]!.length; column += 1) {
        const target = map.mediaIds[row]![column];
        if (!target || (map.center && row === map.center[0] && column === map.center[1])) continue;
        const distance = map.center
          ? Math.abs(row - map.center[0]) + Math.abs(column - map.center[1])
          : 2;
        if (distance < 1 || distance > 2) continue;
        candidates.push({
          target,
          distance: distance as 1 | 2,
          direction:
            row < (map.center?.[0] ?? row)
              ? 'up'
              : row > (map.center?.[0] ?? row)
                ? 'down'
                : column < (map.center?.[1] ?? column)
                  ? 'left'
                  : 'right',
        });
      }
    }
    return candidates.slice(0, 8);
  }

  private invalid(state: ClientState, reason: string): void {
    this.send(state, { type: 'error', v: 1, message: reason });
  }

  private send(state: ClientState, message: Record<string, unknown>): void {
    if (state.socket.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(message));
  }

  private remove(state: ClientState): void {
    if (!this.clients.delete(state)) return;
    clearTimeout(state.authTimer);
    if (state.userId) this.preload.remove(state.userId, state.sessionId, state.clientId);
  }

  private isAllowedOrigin(origin: string | undefined): boolean {
    const configured = this.config.get('CORS_ORIGIN') as unknown;
    if (!origin || !configured || configured === '*') return true;
    return Array.isArray(configured) ? configured.includes(origin) : configured === origin;
  }

  private cookies(header: string): Record<string, string> {
    return Object.fromEntries(
      header.split(';').flatMap(part => {
        const index = part.indexOf('=');
        if (index < 0) return [];
        const value = part.slice(index + 1).trim();
        try {
          return [[part.slice(0, index).trim(), decodeURIComponent(value)]];
        } catch {
          return [];
        }
      })
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isFocus(value: Record<string, unknown>): value is FocusMessage {
    return (
      this.isSequence(value.clientSequence) &&
      this.isSequence(value.navigationRevision) &&
      (value.view === 'browse' || value.view === 'details' || value.view === 'player') &&
      (value.media === null || this.isMedia(value.media))
    );
  }

  private isMap(value: Record<string, unknown>): value is MapMessage {
    if (!this.isSequence(value.clientSequence) || !this.isSequence(value.navigationRevision))
      return false;
    if (!Array.isArray(value.mediaIds) || value.mediaIds.length > MAX_MAP_SIDE) return false;
    const cells = value.mediaIds.reduce(
      (count, row) => count + (Array.isArray(row) ? row.length : MAX_MAP_CELLS),
      0
    );
    if (
      cells > MAX_MAP_CELLS ||
      value.mediaIds.some(row => !Array.isArray(row) || row.length > MAX_MAP_SIDE)
    )
      return false;
    if (
      value.center !== null &&
      (!Array.isArray(value.center) ||
        value.center.length !== 2 ||
        !value.center.every((coordinate: unknown) => Number.isSafeInteger(coordinate)))
    )
      return false;
    if (
      Array.isArray(value.center) &&
      (value.center[0] < 0 ||
        value.center[0] >= value.mediaIds.length ||
        value.center[1] < 0 ||
        !Array.isArray(value.mediaIds[value.center[0]]) ||
        value.center[1] >= value.mediaIds[value.center[0]].length ||
        value.mediaIds[value.center[0]][value.center[1]] === null)
    )
      return false;
    if (value.visible !== undefined) {
      if (!Array.isArray(value.visible) || value.visible.length > MAX_MAP_CELLS) return false;
      for (const coordinate of value.visible) {
        if (
          !Array.isArray(coordinate) ||
          coordinate.length !== 2 ||
          !coordinate.every(
            (coordinateValue: unknown) =>
              typeof coordinateValue === 'number' &&
              Number.isSafeInteger(coordinateValue) &&
              coordinateValue >= 0
          )
        )
          return false;
        const [row, column] = coordinate;
        if (
          row >= value.mediaIds.length ||
          column >= value.mediaIds[row].length ||
          value.mediaIds[row][column] === null
        )
          return false;
      }
    }
    return value.mediaIds.every(row =>
      row.every((cell: unknown) => cell === null || this.isMedia(cell))
    );
  }

  private isHeartbeat(value: Record<string, unknown>): value is HeartbeatMessage {
    return this.isSequence(value.clientSequence) && typeof value.visible === 'boolean';
  }

  private isProgress(
    value: Record<string, unknown>
  ): value is ProgressMessage & Record<string, unknown> {
    return (
      this.isSequence(value.clientSequence) &&
      this.isPlayable(value.playable) &&
      typeof value.positionSeconds === 'number' &&
      Number.isFinite(value.positionSeconds) &&
      value.positionSeconds >= 0 &&
      typeof value.durationSeconds === 'number' &&
      Number.isFinite(value.durationSeconds) &&
      value.durationSeconds > 0 &&
      value.positionSeconds <= value.durationSeconds &&
      (value.state === 'playing' || value.state === 'paused' || value.state === 'completed')
    );
  }

  private isSequence(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }

  private isMedia(value: unknown): value is MediaIntentRef {
    if (
      !this.isRecord(value) ||
      (value.kind !== 'movie' && value.kind !== 'show' && value.kind !== 'episode')
    )
      return false;
    if (value.kind === 'movie' || value.kind === 'show') {
      return (
        typeof value.mediaId === 'number' &&
        Number.isSafeInteger(value.mediaId) &&
        value.mediaId > 0
      );
    }
    return (
      typeof value.showMediaId === 'number' &&
      typeof value.seasonNumber === 'number' &&
      typeof value.episodeNumber === 'number' &&
      Number.isSafeInteger(value.showMediaId) &&
      Number.isSafeInteger(value.seasonNumber) &&
      Number.isSafeInteger(value.episodeNumber) &&
      value.showMediaId > 0 &&
      value.seasonNumber >= 0 &&
      value.episodeNumber > 0
    );
  }

  private isPlayable(value: unknown): value is ProgressRequest['playable'] {
    return this.isMedia(value) && value.kind !== 'show';
  }

  private warmupDescription(state: string): string {
    return state === 'ready'
      ? 'Ready to play'
      : state === 'warming'
        ? 'Preparing playback'
        : state === 'failed'
          ? 'Preparation failed'
          : state === 'paused'
            ? 'Preparation paused'
            : 'Checking sources';
  }

  private mediaIdFor(media: MediaIntentRef): number {
    return media.kind === 'episode' ? media.showMediaId : media.mediaId;
  }
}
