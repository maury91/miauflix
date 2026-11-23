import type { MovieDetail, TVShowDetail } from '@miauwatch/service-contracts';

import { isAnimeDetail } from './media-language.util';

const movie = (overrides: Partial<MovieDetail>) =>
  ({ mediaType: 'movie', genres: [], originalLanguage: 'en', ...overrides }) as MovieDetail;

describe('isAnimeDetail', () => {
  it('counts Japanese animation as anime', () => {
    expect(
      isAnimeDetail(movie({ originalLanguage: 'ja', genres: [{ id: 16, name: 'Animation' }] }))
    ).toBe(true);
  });

  it('leaves other animation and Japanese live action out', () => {
    expect(isAnimeDetail(movie({ genres: [{ id: 16, name: 'Animation' }] }))).toBe(false);
    expect(
      isAnimeDetail(movie({ originalLanguage: 'ja', genres: [{ id: 18, name: 'Drama' }] }))
    ).toBe(false);
  });

  it('counts shows numbered by AniList entry', () => {
    const show = { mediaType: 'tv', genres: [], originalLanguage: null, seasonLayout: 'anilist' };
    expect(isAnimeDetail(show as unknown as TVShowDetail)).toBe(true);
  });
});
