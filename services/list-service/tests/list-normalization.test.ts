import { describe, expect, it } from 'bun:test';

import {
  mapItems,
  mapMixedItems,
  normalizeListItems,
  normalizeMixedListItems,
} from '../src/list-normalization';

describe('Trakt list normalization', () => {
  it('wraps bare popular items for the shared mapper', () => {
    const items = normalizeListItems([{ ids: { trakt: 1, tmdb: 2 } }], 'movie', true);

    expect(mapItems(items, 'movie')).toEqual([
      {
        key: 'trakt:movie:1',
        rank: 0,
        media: { mediaType: 'movie', ids: { trakt: 1, tmdb: 2 } },
      },
    ]);
  });

  it("wraps bare popular shows with Trakt's show field", () => {
    const items = normalizeListItems([{ ids: { trakt: 1, tmdb: 2 } }], 'tv', true);

    expect(mapItems(items, 'tv')).toEqual([
      {
        key: 'trakt:tv:1',
        rank: 0,
        media: { mediaType: 'tv', ids: { trakt: 1, tmdb: 2 } },
      },
    ]);
  });

  it('preserves nested trending and personal item shapes', () => {
    const items = normalizeListItems(
      [{ show: { ids: { trakt: 3, imdb: 'tt1234567' } } }],
      'tv',
      false
    );

    expect(mapItems(items, 'tv')[0]?.media).toEqual({
      mediaType: 'tv',
      ids: { trakt: 3, imdb: 'tt1234567' },
    });
  });

  it('drops duplicate identities while preserving first-seen order', () => {
    const items = normalizeMixedListItems([
      { movie: { ids: { trakt: 1, tmdb: 10, imdb: 'tt0000010' } } },
      { movie: { ids: { trakt: 1, tmdb: 10, imdb: 'tt0000010' } } },
      { show: { ids: { trakt: 2, tmdb: 20 } } },
    ]);

    expect(mapMixedItems(items)).toEqual([
      {
        key: 'trakt:movie:1',
        rank: 0,
        media: {
          mediaType: 'movie',
          ids: { trakt: 1, tmdb: 10, imdb: 'tt0000010' },
        },
      },
      {
        key: 'trakt:tv:2',
        rank: 1,
        media: { mediaType: 'tv', ids: { trakt: 2, tmdb: 20 } },
      },
    ]);
  });

  it('recognizes the same media when duplicate entries expose different aliases', () => {
    const items = normalizeListItems(
      [{ ids: { trakt: 1, tmdb: 10 } }, { ids: { trakt: 1, imdb: 'tt0000010' } }],
      'movie',
      true
    );

    expect(mapItems(items, 'movie')).toHaveLength(1);
  });

  it('rejects nested items without a media object', () => {
    expect(() => normalizeListItems([{}], 'movie', false)).toThrow();
  });

  it('rejects items with the wrong media field for the requested list type', () => {
    expect(() => normalizeListItems([{ show: { ids: { trakt: 3 } } }], 'movie', false)).toThrow();
    expect(() => normalizeListItems([{ movie: { ids: { trakt: 3 } } }], 'tv', false)).toThrow();
  });
});
