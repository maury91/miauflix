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

it('sanitization retains each recorded IMDb identity, including mismatched hits', () => {
  const directory = new URL('../../yts/data/api/v2/', import.meta.url);
  let checked = 0;
  for (const name of readdirSync(directory)) {
    const match = /query_term-(tt\d+)\.json$/.exec(name);
    if (!match) continue;
    const fixture = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
    const movies = fixture.data?.data?.movies ?? [];
    const result = sanitize(
      {
        status: 'ok',
        data: {
          // Exercise recorded identities independently of torrent hash fictionalization.
          movies: movies.map((movie: { id: number; imdb_code: string }) => ({
            id: movie.id,
            imdb_code: movie.imdb_code,
            torrents: [],
          })),
        },
      },
      `https://yts.invalid/api/v2/list_movies.json?query_term=${match[1]}`
    );
    expect(
      (result.data?.movies ?? []).map((movie: { imdb_code: string }) => movie.imdb_code)
    ).toEqual(movies.map((movie: { imdb_code: string }) => movie.imdb_code));
    checked += movies.length;
  }
  expect(checked).toBeGreaterThan(0);
});
