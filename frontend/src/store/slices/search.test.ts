import type { SearchResultDto } from '@miauflix/backend';
import { describe, expect, it } from 'vitest';

import { initialSearchState, searchActions, searchSlice, type SearchState } from './search';

const reduce = (state: SearchState, ...actions: Parameters<typeof searchSlice.reducer>[1][]) =>
  actions.reduce(searchSlice.reducer, state);

const result = (mediaId: number, _type: 'movie' | 'tvshow' = 'movie'): SearchResultDto => ({
  _type,
  mediaId,
  title: `Title ${mediaId}`,
  overview: '',
  poster: '',
  backdrop: '',
  releaseDate: '2021-01-01',
  rating: 7,
});

const page = (requestId: number, results: SearchResultDto[], pageNumber = 1) =>
  searchActions.serverMessage({
    type: 'search-results',
    requestId,
    page: pageNumber,
    totalPages: 3,
    totalResults: 50,
    results,
  });

describe('search slice', () => {
  it('shows the first page, appends later pages and fills in details', () => {
    const state = reduce(
      initialSearchState,
      searchActions.queryChanged('dune'),
      searchActions.searchStarted({ requestId: 1, page: 1 }),
      page(1, [result(1), result(2)]),
      searchActions.searchStarted({ requestId: 2, page: 2 }),
      page(2, [result(2), result(3)], 2),
      searchActions.serverMessage({
        type: 'search-details',
        requestId: 1,
        items: [{ _type: 'movie', mediaId: 1, runtime: 155 }],
      })
    );
    expect(state.status).toBe('ready');
    expect(state.results.map(item => item.mediaId)).toEqual([1, 2, 3]);
    expect(state.page).toBe(2);
    expect(state.moreRequestId).toBeNull();
    expect(state.details['movie:1']?.runtime).toBe(155);
  });

  it('ignores answers to searches that were replaced', () => {
    const state = reduce(
      initialSearchState,
      searchActions.queryChanged('du'),
      searchActions.searchStarted({ requestId: 1, page: 1 }),
      searchActions.queryChanged('dune'),
      searchActions.searchStarted({ requestId: 2, page: 1 }),
      page(1, [result(9)]),
      page(2, [result(1)])
    );
    expect(state.results.map(item => item.mediaId)).toEqual([1]);
  });

  it('clears results when the query is erased and drops late answers', () => {
    const state = reduce(
      initialSearchState,
      searchActions.queryChanged('d'),
      searchActions.searchStarted({ requestId: 1, page: 1 }),
      searchActions.queryChanged(''),
      page(1, [result(1)])
    );
    expect(state.status).toBe('idle');
    expect(state.results).toEqual([]);
  });

  it('switches between genres and typed queries', () => {
    const genre = reduce(initialSearchState, searchActions.genreSelected('anime'));
    expect(genre).toMatchObject({ genre: 'anime', query: 'Anime' });
    expect(reduce(genre, searchActions.queryChanged('x'))).toMatchObject({
      genre: null,
      query: 'x',
    });
    expect(
      reduce(
        initialSearchState,
        searchActions.recentSelected({ kind: 'genre', query: 'scifi', searchedAt: '' })
      )
    ).toMatchObject({ genre: 'scifi', query: 'Sci-Fi' });
  });

  it('marks a failed first page as an error and keeps recents up to date', () => {
    const state = reduce(
      initialSearchState,
      searchActions.queryChanged('dune'),
      searchActions.searchStarted({ requestId: 4, page: 1 }),
      searchActions.serverMessage({ type: 'search-error', requestId: 4, message: 'search-failed' }),
      searchActions.serverMessage({
        type: 'search-recents',
        items: [{ kind: 'query', query: 'Dune', searchedAt: '2026-01-01T00:00:00Z' }],
      })
    );
    expect(state.status).toBe('error');
    expect(state.recents).toHaveLength(1);
  });
});
