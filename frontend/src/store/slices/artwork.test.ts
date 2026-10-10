import { describe, expect, it } from 'vitest';

import { artworkActions, artworkSlice } from './artwork';

const update = (artworkRevision: number, logo: string, cardLogoStatus: 'pending' | 'ready') => ({
  mediaType: 'movie' as const,
  mediaId: 42,
  backdrop: 'backdrop.jpg',
  logo,
  heroLogo: logo,
  artworkRevision,
  cardLogoStatus,
  heroLogoStatus: cardLogoStatus,
});

describe('artwork state', () => {
  it('keeps newer socket and HTTP artwork snapshots over delayed older responses', () => {
    let state = artworkSlice.reducer(undefined, { type: 'init' });
    state = artworkSlice.reducer(
      state,
      artworkActions.received(update(4, 'selected.png', 'ready'))
    );
    state = artworkSlice.reducer(state, artworkActions.received(update(3, 'stale.png', 'ready')));

    expect(state.byMedia['movie:42']).toEqual(update(4, 'selected.png', 'ready'));
  });

  it('accepts a newer pending revision so invalidated selections use provider fallback', () => {
    let state = artworkSlice.reducer(undefined, { type: 'init' });
    state = artworkSlice.reducer(state, artworkActions.received(update(4, 'old.png', 'ready')));
    state = artworkSlice.reducer(
      state,
      artworkActions.received(update(5, 'provider.png', 'pending'))
    );

    expect(state.byMedia['movie:42']).toEqual(update(5, 'provider.png', 'pending'));
  });
});
