import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeClient } from './realtime.client';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('authenticates and coalesces rapid map updates to the latest frame', () => {
    const client = new RealtimeClient('session-1', 'tab-1', vi.fn());
    client.start();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message({ type: 'ready', v: 1 });

    client.publishFocus({
      navigationRevision: 1,
      view: 'browse',
      media: { kind: 'movie', mediaId: 10 },
    });
    client.publishMap({
      navigationRevision: 1,
      center: [0, 0],
      mediaIds: [[{ kind: 'movie', mediaId: 10 }]],
    });
    client.publishMap({
      navigationRevision: 2,
      center: [0, 0],
      mediaIds: [[{ kind: 'movie', mediaId: 11 }]],
    });

    vi.advanceTimersByTime(49);
    expect(socket.sent.filter(frame => JSON.parse(frame).type === 'map')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    const maps = socket.sent
      .map(frame => JSON.parse(frame))
      .filter((frame: { type: string }) => frame.type === 'map');
    expect(maps).toHaveLength(1);
    expect(maps[0].mediaIds[0][0].mediaId).toBe(11);
  });

  it('drops status from before the current focus sequence', () => {
    const onStatus = vi.fn();
    const client = new RealtimeClient('session-1', 'tab-1', onStatus);
    client.start();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message({ type: 'ready', v: 1 });
    client.publishFocus({
      navigationRevision: 1,
      view: 'browse',
      media: { kind: 'movie', mediaId: 10 },
    });
    client.publishFocus({
      navigationRevision: 2,
      view: 'browse',
      media: { kind: 'movie', mediaId: 11 },
    });
    socket.message({
      type: 'source-status',
      focusSequence: 1,
      mediaId: 10,
      media: { kind: 'movie', mediaId: 10 },
      status: 'source_found',
      sourceId: 2,
      quality: 'FHD',
      source: 'WEB',
    });
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('sends playback progress over the authenticated socket and falls back while offline', () => {
    const client = new RealtimeClient('session-1', 'tab-1', vi.fn());
    const progress = {
      playable: { kind: 'movie' as const, mediaId: 10 },
      positionSeconds: 12,
      durationSeconds: 120,
      state: 'playing' as const,
    };

    expect(client.publishProgress(progress)).toBe(false);
    client.start();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message({ type: 'ready', v: 1 });

    expect(client.publishProgress(progress)).toBe(true);
    const frame = JSON.parse(socket.sent.at(-1)!);
    expect(frame).toMatchObject({ type: 'progress', ...progress });
    expect(frame.clientSequence).toEqual(expect.any(Number));
  });

  it('batches artwork subscriptions, replays them after reconnect, and delivers artwork updates', () => {
    const onArtwork = vi.fn();
    const client = new RealtimeClient('session-1', 'tab-1', vi.fn(), undefined, onArtwork);
    client.setArtworkSubscriptions(
      Array.from({ length: 60 }, (_, index) => ({
        mediaType: 'movie' as const,
        mediaId: index + 1,
      }))
    );
    client.start();
    const firstSocket = FakeWebSocket.instances[0]!;
    firstSocket.open();
    firstSocket.message({ type: 'ready', v: 1 });
    const firstBatches = firstSocket.sent
      .map(frame => JSON.parse(frame))
      .filter(frame => frame.type === 'artwork-subscribe');
    expect(firstBatches.map(frame => frame.items.length)).toEqual([50, 10]);

    firstSocket.message({
      type: 'artwork-update',
      mediaType: 'movie',
      mediaId: 1,
      backdrop: 'backdrop.jpg',
      logo: 'card.png',
      heroLogo: 'hero.png',
      artworkRevision: 2,
      cardLogoStatus: 'ready',
      heroLogoStatus: 'ready',
    });
    expect(onArtwork).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 1, artworkRevision: 2, heroLogo: 'hero.png' })
    );

    firstSocket.close();
    vi.advanceTimersByTime(1_000);
    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.open();
    secondSocket.message({ type: 'ready', v: 1 });
    const replayed = secondSocket.sent
      .map(frame => JSON.parse(frame))
      .filter(frame => frame.type === 'artwork-subscribe');
    expect(replayed.map(frame => frame.items.length)).toEqual([50, 10]);
    client.stop();
  });
});
