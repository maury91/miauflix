import type { RealtimeMediaRef } from '@features/realtime/realtime.client';
import { describe, expect, it } from 'vitest';

import { buildHomeRealtimeInterest } from './homeInterest';

const movie = (mediaId: number): RealtimeMediaRef => ({ kind: 'movie', mediaId });

describe('home realtime interest', () => {
  it('keeps the focused row centered in the bounded map and reports visible neighboring rows', () => {
    const rowWindows = Array.from({ length: 15 }, (_, row) => ({
      media: [movie(row * 10), movie(row * 10 + 1)],
      center: 1,
      visible: [0, 1],
    }));

    const interest = buildHomeRealtimeInterest({
      activeCategory: 9,
      rowCount: 15,
      rowWindows,
      selectedMedia: movie(91),
      view: 'browse',
    });

    expect(interest?.focus).toEqual({ view: 'browse', media: movie(91) });
    expect(interest?.map.mediaIds).toHaveLength(11);
    expect(interest?.map.center).toEqual([5, 1]);
    expect(interest?.map.visible).toEqual([
      [5, 0],
      [5, 1],
      [6, 0],
      [6, 1],
    ]);
  });

  it('clears the map outside browsing and clears media focus during playback', () => {
    const input = {
      activeCategory: 0,
      rowCount: 1,
      rowWindows: [{ media: [movie(1)], center: 0, visible: [0] }],
      selectedMedia: movie(1),
    };

    expect(buildHomeRealtimeInterest({ ...input, view: 'details' })).toEqual({
      focus: { view: 'details', media: movie(1) },
      map: { center: null, mediaIds: [], visible: [] },
    });
    expect(buildHomeRealtimeInterest({ ...input, view: 'player' })).toEqual({
      focus: { view: 'player', media: null },
      map: { center: null, mediaIds: [], visible: [] },
    });
  });

  it('publishes an empty map when there are no categories and preserves the current focus', () => {
    expect(
      buildHomeRealtimeInterest({
        activeCategory: 0,
        rowCount: 0,
        rowWindows: [],
        selectedMedia: movie(42),
        view: 'details',
      })
    ).toEqual({
      focus: { view: 'details', media: movie(42) },
      map: { center: null, mediaIds: [], visible: [] },
    });
  });
});
