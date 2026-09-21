import { describe, expect, it } from 'bun:test';

import { mapItems, normalizeListItems } from '../src/list-normalization';

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

  it('rejects nested items without a media object', () => {
    expect(() => normalizeListItems([{}], 'movie', false)).toThrow();
  });

  it('rejects items with the wrong media field for the requested list type', () => {
    expect(() => normalizeListItems([{ show: { ids: { trakt: 3 } } }], 'movie', false)).toThrow();
    expect(() => normalizeListItems([{ movie: { ids: { trakt: 3 } } }], 'tv', false)).toThrow();
  });
});
