import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'bun:test';

import { sanitize } from './yts.sanitize';

it('keeps provider IMDb IDs stable while fictionalizing source display content', () => {
  const original = {
    status: 'ok',
    data: { movies: [{ id: 123, imdb_code: 'tt0137523', title: 'Example title', torrents: [] }] },
  };
  const result = sanitize(
    original,
    'https://yts.invalid/api/v2/list_movies.json?query_term=tt0137523'
  );
  expect(result.data.movies[0].imdb_code).toBe('tt0137523');
  expect(result.data.movies[0].title).not.toBe(original.data.movies[0].title);
  expect(original.data.movies[0].imdb_code).toBe('tt0137523');
});

it('preserves an actually mismatched response so production identity validation can reject it', () => {
  const original = {
    status: 'ok',
    data: { movies: [{ id: 124, imdb_code: 'tt0111161', title: 'Another title', torrents: [] }] },
  };
  const result = sanitize(
    original,
    'https://yts.invalid/api/v2/list_movies.json?query_term=tt0137523'
  );
  expect(result.data.movies[0].imdb_code).toBe('tt0111161');
});

it('all recorded IMDb lookups retain the identity encoded in their fixture request', () => {
  const directory = new URL('../../yts/data/api/v2/', import.meta.url);
  let checked = 0;
  for (const name of readdirSync(directory)) {
    const match = /query_term-(tt\d+)\.json$/.exec(name);
    if (!match) continue;
    const fixture = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
    for (const movie of fixture.data?.data?.movies ?? []) {
      expect(movie.imdb_code).toBe(match[1]);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
});
