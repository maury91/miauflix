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

describe('repeated artwork', () => {
  it('keeps the state unchanged when the same artwork arrives again', () => {
    const state = artworkSlice.reducer(
      undefined,
      artworkActions.received(update(4, 'logo.png', 'ready'))
    );

    expect(
      artworkSlice.reducer(state, artworkActions.received(update(4, 'logo.png', 'ready')))
    ).toBe(state);
    expect(
      artworkSlice.reducer(state, artworkActions.receivedMany([update(4, 'logo.png', 'ready')]))
    ).toBe(state);
  });

  it('takes a same-revision update whose values differ', () => {
    let state = artworkSlice.reducer(
      undefined,
      artworkActions.received(update(4, 'logo.png', 'pending'))
    );
    state = artworkSlice.reducer(state, artworkActions.received(update(4, 'logo.png', 'ready')));

    expect(state.byMedia['movie:42']?.cardLogoStatus).toBe('ready');
  });

  it('applies a batch title by title, skipping older revisions', () => {
    let state = artworkSlice.reducer(
      undefined,
      artworkActions.received(update(4, 'current.png', 'ready'))
    );
    state = artworkSlice.reducer(
      state,
      artworkActions.receivedMany([
        update(3, 'stale.png', 'ready'),
        { ...update(1, 'other.png', 'ready'), mediaId: 7 },
      ])
    );

    expect(state.byMedia['movie:42']?.logo).toBe('current.png');
    expect(state.byMedia['movie:7']?.logo).toBe('other.png');
  });

  it('keeps the state unchanged when removing titles it does not hold', () => {
    const state = artworkSlice.reducer(
      undefined,
      artworkActions.received(update(4, 'logo.png', 'ready'))
    );

    expect(
      artworkSlice.reducer(state, artworkActions.removed([{ mediaType: 'tv', mediaId: 42 }]))
    ).toBe(state);
  });
});
