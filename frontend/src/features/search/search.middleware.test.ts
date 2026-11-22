import { realtimeRuntimeActions } from '@features/realtime/realtime.middleware';
import type { SearchClientMessage } from '@miauflix/backend';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { setActiveLanguage } from '@shared/i18n/translate';
import { searchActions, searchSlice } from '@store/slices/search';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_DEBOUNCE_MS, searchMiddleware } from './search.middleware';

vi.mock('@features/realtime/realtime.middleware', async () => {
  const { createAction } = await import('@reduxjs/toolkit');
  return {
    realtimeRuntimeActions: {
      searchRequested: createAction<SearchClientMessage>('realtimeRuntime/searchRequested'),
    },
  };
});

const setupTest = () => {
  const sent: SearchClientMessage[] = [];
  const capture: Middleware = () => next => action => {
    if (realtimeRuntimeActions.searchRequested.match(action)) sent.push(action.payload);
    return next(action);
  };
  const store = configureStore({
    reducer: { [searchSlice.name]: searchSlice.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(searchMiddleware, capture),
  });
  return { store, sent };
};

describe('searchMiddleware', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces typing into a single live search', () => {
    const { store, sent } = setupTest();
    store.dispatch(searchActions.queryChanged('d'));
    store.dispatch(searchActions.queryChanged('du'));
    store.dispatch(searchActions.queryChanged('dune '));
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(sent).toEqual([
      { type: 'search', requestId: expect.any(Number), page: 1, language: 'en', query: 'dune' },
    ]);
    expect(store.getState().search.status).toBe('loading');
  });

  it('cancels the pending search when the query is cleared', () => {
    const { store, sent } = setupTest();
    store.dispatch(searchActions.queryChanged('d'));
    store.dispatch(searchActions.queryChanged(''));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(sent).toEqual([]);
  });

  it('sends submits and genre chips at once and records them', () => {
    const { store, sent } = setupTest();
    store.dispatch(searchActions.queryChanged('dune'));
    store.dispatch(searchActions.submitted());
    store.dispatch(searchActions.genreSelected({ key: 'anime', name: 'Anime' }));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(sent).toEqual([
      expect.objectContaining({ type: 'search', query: 'dune', commit: true }),
      expect.objectContaining({ type: 'search', genre: 'anime', commit: true }),
    ]);
  });

  it('requests the next page only while more pages exist', () => {
    const { store, sent } = setupTest();
    store.dispatch(searchActions.submitted());
    expect(sent).toEqual([]);

    store.dispatch(searchActions.queryChanged('dune'));
    store.dispatch(searchActions.submitted());
    const { requestId } = store.getState().search;
    store.dispatch(
      searchActions.serverMessage({
        type: 'search-results',
        requestId,
        page: 1,
        totalPages: 2,
        totalResults: 30,
        results: [],
      })
    );
    store.dispatch(searchActions.nextPageRequested());
    store.dispatch(searchActions.nextPageRequested());

    expect(sent.at(-1)).toEqual(expect.objectContaining({ page: 2, query: 'dune' }));
    expect(sent.filter(message => message.type === 'search' && message.page === 2)).toHaveLength(1);
  });

  it('records the search behind an opened result and manages recents', () => {
    const { store, sent } = setupTest();
    store.dispatch(searchActions.genreSelected({ key: '27', name: 'Horror' }));
    sent.length = 0;
    store.dispatch(
      searchActions.resultOpened({
        _type: 'movie',
        mediaId: 1,
        title: '',
        overview: '',
        poster: '',
        backdrop: '',
        releaseDate: '',
        rating: 0,
      })
    );
    store.dispatch(searchActions.recentsRequested());
    store.dispatch(searchActions.genresRequested());
    store.dispatch(
      searchActions.recentRemoved({ kind: 'query', query: 'Dune', label: 'Dune', searchedAt: '' })
    );

    expect(sent).toEqual([
      { type: 'search-recent-add', kind: 'genre', query: '27', language: 'en' },
      { type: 'search-recents', language: 'en' },
      { type: 'search-genres', language: 'en' },
      { type: 'search-recent-remove', kind: 'query', query: 'Dune', language: 'en' },
    ]);
  });

  describe('when the interface language changes', () => {
    afterEach(() => setActiveLanguage('en'));

    it('loads the genres, recents and active search again in it', () => {
      const { store, sent } = setupTest();
      store.dispatch(searchActions.genreSelected({ key: '27', name: 'Horror' }));
      store.dispatch(searchActions.serverMessage({ type: 'search-genres', items: [] }));
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-recents',
          items: [{ kind: 'query', query: 'Dune', label: 'Dune', searchedAt: '' }],
        })
      );
      sent.length = 0;

      setActiveLanguage('it');
      store.dispatch(searchActions.catalogLanguageChanged());

      // No genres were loaded, so none are asked for
      expect(sent).toEqual([
        { type: 'search-recents', language: 'it' },
        expect.objectContaining({ type: 'search', genre: '27', page: 1, language: 'it' }),
      ]);
      expect(sent[1]).not.toHaveProperty('commit');
    });

    it('ignores genres and recents that arrive for the earlier language', () => {
      const { store } = setupTest();
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-genres',
          items: [{ key: '18', name: 'Drama' }],
          language: 'en',
        })
      );
      setActiveLanguage('it');
      store.dispatch(searchActions.catalogLanguageChanged());
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-genres',
          items: [{ key: '18', name: 'Dramma (stale)' }],
          language: 'en',
        })
      );
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-recents',
          items: [{ kind: 'query', query: 'Dune', label: 'Dune', searchedAt: '' }],
          language: 'en',
        })
      );
      expect(store.getState().search.genres).toEqual([{ key: '18', name: 'Drama' }]);
      expect(store.getState().search.recents).toEqual([]);

      store.dispatch(
        searchActions.serverMessage({
          type: 'search-genres',
          items: [{ key: '18', name: 'Dramma' }],
          language: 'it',
        })
      );
      expect(store.getState().search.genres).toEqual([{ key: '18', name: 'Dramma' }]);
    });

    it('sends nothing while Search was never opened', () => {
      const { store, sent } = setupTest();
      setActiveLanguage('it');
      store.dispatch(searchActions.catalogLanguageChanged());
      expect(sent).toEqual([]);
    });
  });
});
