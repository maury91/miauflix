import { describe, expect, it } from 'vitest';

import { realtimeActions, realtimeSlice } from './realtime';

describe('realtime state', () => {
  it('stores socket preparation updates for subscribed views', () => {
    let state = realtimeSlice.reducer(undefined, { type: '@@test/init' });
    state = realtimeSlice.reducer(state, realtimeActions.connectionChanged(true));
    state = realtimeSlice.reducer(
      state,
      realtimeActions.statusReceived({
        type: 'source-status',
        mediaId: 7,
        media: { kind: 'movie', mediaId: 7 },
        status: 'source_found',
        sourceId: 12,
        quality: '1080p',
        source: 'torrent',
        focusSequence: 3,
      })
    );
    state = realtimeSlice.reducer(
      state,
      realtimeActions.statusReceived({
        type: 'warmup',
        mediaId: 7,
        media: { kind: 'movie', mediaId: 7 },
        playable: { kind: 'movie', mediaId: 7 },
        status: 'warming',
        loaded: 50,
        verifiedBytes: 40,
        targetBytes: 100,
        statusDescription: 'Warming',
        focusSequence: 3,
      })
    );

    expect(state.ready).toBe(true);
    expect(state.preparationByMediaId[7]).toMatchObject({
      state: 'source_found',
      source: { id: 12, quality: '1080p', sourceType: 'torrent' },
      warmup: { state: 'warming', progress: 50, verifiedBytes: 40, targetBytes: 100 },
    });

    state = realtimeSlice.reducer(state, realtimeActions.resetRealtimeState());
    expect(state).toEqual({ ready: false, preparationByMediaId: {}, playbackDeliveries: {} });
  });
});
