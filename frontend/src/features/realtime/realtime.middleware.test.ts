import { listsApi } from '@features/media/api/lists.api';
import { notificationsApi } from '@features/notifications/api/notifications.api';
import { playbackApi } from '@features/player/api/playback.api';
import { preloadApi } from '@features/preload/api/preload.api';
import type { ProgressRequest } from '@miauflix/backend';
import type { MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { artworkSlice } from '@store/slices/artwork';
import { authSlice, clearAuth, setSession } from '@store/slices/auth';
import { realtimeActions, realtimeSlice } from '@store/slices/realtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  clients: [] as unknown[],
  applyProgressUpdate: vi.fn(),
  fallbackProgress: vi.fn(),
  initiateProgress: vi.fn(),
}));

vi.mock('@features/realtime/realtime.client', () => ({
  RealtimeClient: class {
    onStatus: (message: never) => void;
    onReady: (ready: boolean) => void;
    onArtwork: (update: never) => void;
    start = vi.fn();
    stop = vi.fn();
    setVisible = vi.fn();
    setArtworkSubscriptions = vi.fn();
    publishFocus = vi.fn();
    publishMap = vi.fn();
    publishProgress = vi.fn(() => true);

    constructor(
      readonly session: string,
      _clientId: string,
      onStatus: (message: never) => void,
      onReady: (ready: boolean) => void,
      onArtwork: (update: never) => void
    ) {
      this.onStatus = onStatus;
      this.onReady = onReady;
      this.onArtwork = onArtwork;
      runtime.clients.push(this);
    }
  },
}));

vi.mock('@features/progress/api/progress.api', () => ({
  applyProgressUpdate: runtime.applyProgressUpdate,
  progressApi: {
    util: {
      resetApiState: () => ({ type: 'progressApi/resetApiState' }),
    },
    endpoints: {
      updateProgress: {
        initiate: runtime.initiateProgress,
      },
    },
  },
}));

import {
  realtimeMiddleware,
  realtimeRuntimeActions,
  saveProgressWithRealtime,
} from './realtime.middleware';

function makeStore() {
  const seenActions: string[] = [];
  const observe: Middleware = () => next => action => {
    if (typeof (action as { type?: unknown }).type === 'string') {
      seenActions.push((action as { type: string }).type);
    }
    return next(action);
  };
  const store = configureStore({
    reducer: {
      auth: authSlice.reducer,
      artwork: artworkSlice.reducer,
      realtime: realtimeSlice.reducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(observe, realtimeMiddleware),
  });
  return { store, seenActions };
}

describe('realtime middleware', () => {
  afterEach(() => {
    const { store } = makeStore();
    store.dispatch(clearAuth());
    store.dispatch(realtimeRuntimeActions.artworkSubscriptionsChanged([]));
    runtime.clients = [];
    runtime.applyProgressUpdate.mockReset();
    runtime.fallbackProgress.mockReset();
    runtime.initiateProgress.mockReset();
  });

  it('drops pushed availability and refetches details after a reconnect', () => {
    const { store, seenActions } = makeStore();
    store.dispatch(setSession('reconnect-session'));
    const client = runtime.clients[0] as { onReady: (ready: boolean) => void };
    const pushed = () => store.getState().realtime.availabilityByPlayable;
    client.onReady(true);
    store.dispatch(
      realtimeActions.sourceReceived({
        type: 'source-availability',
        playable: { kind: 'movie', mediaId: 7 },
        availability: 'unavailable',
      } as never)
    );
    expect(pushed()).toEqual({ 'm:7': 'unavailable' });
    expect(seenActions).not.toContain('mediaApi/invalidateTags');

    client.onReady(false);
    expect(pushed()).toEqual({ 'm:7': 'unavailable' });
    client.onReady(true);
    expect(pushed()).toEqual({});
    expect(seenActions).toContain('mediaApi/invalidateTags');
  });

  it('owns one socket per session, reapplies subscriptions, rejects stale events, and routes progress', async () => {
    const { store, seenActions } = makeStore();
    const firstArtwork: MediaRef = { mediaType: 'movie', mediaId: 4 };
    store.dispatch(realtimeRuntimeActions.artworkSubscriptionsChanged([firstArtwork]));
    store.dispatch(setSession('first-session'));

    const first = runtime.clients[0] as {
      onStatus: (message: never) => void;
      onReady: (ready: boolean) => void;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      setArtworkSubscriptions: ReturnType<typeof vi.fn>;
      publishFocus: ReturnType<typeof vi.fn>;
      publishMap: ReturnType<typeof vi.fn>;
      publishProgress: ReturnType<typeof vi.fn>;
    };
    expect(first.start).toHaveBeenCalledOnce();
    expect(first.setArtworkSubscriptions).toHaveBeenLastCalledWith([firstArtwork]);
    first.onReady(true);
    first.onStatus({
      type: 'source-status',
      mediaId: 4,
      media: { kind: 'movie', mediaId: 4 },
      status: 'source_found',
      sourceId: 12,
      source: 'YTS',
      quality: '1080p',
    } as never);
    expect(store.getState().realtime.ready).toBe(true);
    expect(store.getState().realtime.preparationByMediaId[4]?.state).toBe('source_found');

    store.dispatch(setSession('second-session'));
    expect(seenActions).toEqual(
      expect.arrayContaining([
        listsApi.util.resetApiState.type,
        'progressApi/resetApiState',
        playbackApi.util.resetApiState.type,
        preloadApi.util.resetApiState.type,
        notificationsApi.util.resetApiState.type,
      ])
    );
    const second = runtime.clients[1] as typeof first & { session: string };
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.session).toBe('second-session');
    expect(second.setArtworkSubscriptions).toHaveBeenLastCalledWith([firstArtwork]);
    first.onStatus({
      type: 'source-status',
      mediaId: 9,
      media: { kind: 'movie', mediaId: 9 },
      status: 'source_found',
      sourceId: 13,
      source: 'YTS',
      quality: '720p',
    } as never);
    expect(store.getState().realtime.preparationByMediaId[9]).toBeUndefined();

    store.dispatch(
      realtimeRuntimeActions.publishFocusRequested({
        navigationRevision: 1,
        view: 'browse',
        media: { kind: 'movie', mediaId: 4 },
      })
    );
    store.dispatch(
      realtimeRuntimeActions.publishMapRequested({
        navigationRevision: 1,
        center: [0, 0],
        mediaIds: [[{ kind: 'movie', mediaId: 4 }]],
        visible: [[0, 0]],
      })
    );
    expect(second.publishFocus).toHaveBeenCalledOnce();
    expect(second.publishMap).toHaveBeenCalledOnce();

    const update = {
      playable: { kind: 'movie', mediaId: 4 },
      state: 'watching',
      positionSeconds: 3,
      durationSeconds: 30,
    } as ProgressRequest;
    await store.dispatch(saveProgressWithRealtime(update) as never);
    expect(runtime.applyProgressUpdate).toHaveBeenCalledWith(expect.any(Function), update);

    second.publishProgress.mockReturnValue(false);
    runtime.initiateProgress.mockImplementation(() => (_dispatch: unknown) => {
      runtime.fallbackProgress(update);
      return { unwrap: () => Promise.resolve() };
    });
    await store.dispatch(saveProgressWithRealtime(update) as never);
    expect(runtime.initiateProgress).toHaveBeenCalledWith(update);
    expect(runtime.fallbackProgress).toHaveBeenCalledWith(update);
  });
});
