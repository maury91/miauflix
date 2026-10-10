import { describe, expect, it } from 'bun:test';
import { filterTmdbImages, tmdbFixtureQuery } from './tmdb-fixture';

describe('TMDB recorded image language replay', () => {
  it('reuses only details recordings and preserves other query parameters', () => {
    const query = {
      append_to_response: 'translations,images',
      language: 'en',
      include_image_language: 'en,null',
    };
    expect(tmdbFixtureQuery('/3/movie/550', query)).toEqual({
      append_to_response: 'translations,images',
      language: 'en',
    });
    expect(tmdbFixtureQuery('/3/tv/100', query)).not.toBeNull();
    expect(tmdbFixtureQuery('/3/movie/popular', query)).toBeNull();
    expect(tmdbFixtureQuery('/3/movie/550', { language: 'en' })).toBeNull();
  });
  it('filters images without mutating the recording', () => {
    const data = {
      title: 'Movie',
      images: { logos: [{ iso_639_1: 'en' }, { iso_639_1: null }, { iso_639_1: 'fr' }] },
    };
    expect(filterTmdbImages(data, 'en,null')).toEqual({
      title: 'Movie',
      images: { logos: [{ iso_639_1: 'en' }, { iso_639_1: null }] },
    });
    expect(data.images.logos).toHaveLength(3);
  });
});
