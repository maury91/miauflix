import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSessionRequest } = vi.hoisted(() => ({ createSessionRequest: vi.fn() }));

vi.mock('@shared/api/backend-client', () => ({
  backendClient: { api: { playback: { sessions: { $post: createSessionRequest } } } },
}));

import { playbackApi } from './playback.api';

const setupStore = () =>
  configureStore({
    reducer: {
      [playbackApi.reducerPath]: playbackApi.reducer,
      auth: () => ({ currentSessionId: 'session-1' }),
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(playbackApi.middleware),
  });

const request = {
  playable: { kind: 'movie' as const, mediaId: 42 },
  preferences: { quality: 'auto' as const },
};

describe('createSession', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createSessionRequest.mockResolvedValue(Response.json({ playbackId: 'playback-1' }));
  });

  it('sends the sources this browser failed to play', async () => {
    const store = setupStore();

    await store.dispatch(
      playbackApi.endpoints.createSession.initiate({ ...request, avoidSourceIds: [7, 9] })
    );

    expect(createSessionRequest).toHaveBeenCalledWith(
      { json: { ...request, avoidSourceIds: [7, 9] } },
      { headers: { 'X-Session-Id': 'session-1' } }
    );
  });

  it('leaves the field out when nothing failed', async () => {
    const store = setupStore();

    await store.dispatch(
      playbackApi.endpoints.createSession.initiate({ ...request, avoidSourceIds: [] })
    );

    expect(createSessionRequest).toHaveBeenCalledWith(
      { json: request },
      { headers: { 'X-Session-Id': 'session-1' } }
    );
  });
});
