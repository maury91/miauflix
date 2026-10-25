import { realtimeRuntimeActions } from '@features/realtime/realtime.middleware';
import type { SearchClientMessage } from '@miauflix/backend';
import type { Middleware } from '@reduxjs/toolkit';
import { searchActions, type SearchState } from '@store/slices/search';

export const SEARCH_DEBOUNCE_MS = 250;

let nextRequestId = 1;

/**
 * Turns search intent into realtime requests: typing is debounced, while submits, genre chips
 * and recents are sent at once and recorded as recent searches.
 */
export const searchMiddleware: Middleware = api => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const searchState = () => (api.getState() as { search: SearchState }).search;
  const send = (message: SearchClientMessage) =>
    api.dispatch(realtimeRuntimeActions.searchRequested(message));
  const cancelDebounce = () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = null;
  };
  const request = (page: number, commit: boolean) => {
    const { query, genre } = searchState();
    if (!genre && !query.trim()) return;
    const requestId = nextRequestId++;
    api.dispatch(searchActions.searchStarted({ requestId, page }));
    send({
      type: 'search',
      requestId,
      page,
      ...(genre ? { genre } : { query: query.trim() }),
      ...(commit ? { commit } : {}),
    });
  };

  return next => action => {
    const result = next(action);
    if (searchActions.queryChanged.match(action)) {
      cancelDebounce();
      if (searchState().query.trim()) {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          request(1, false);
        }, SEARCH_DEBOUNCE_MS);
      }
    } else if (
      searchActions.submitted.match(action) ||
      searchActions.genreSelected.match(action) ||
      searchActions.recentSelected.match(action)
    ) {
      cancelDebounce();
      request(1, true);
    } else if (searchActions.nextPageRequested.match(action)) {
      const state = searchState();
      if (state.status === 'ready' && state.moreRequestId === null && state.page < state.totalPages)
        request(state.page + 1, false);
    } else if (searchActions.resultOpened.match(action)) {
      const { query, genre } = searchState();
      if (genre) send({ type: 'search-recent-add', kind: 'genre', query: genre });
      else if (query.trim())
        send({ type: 'search-recent-add', kind: 'query', query: query.trim() });
    } else if (searchActions.recentsRequested.match(action)) {
      send({ type: 'search-recents' });
    } else if (searchActions.genresRequested.match(action)) {
      send({ type: 'search-genres' });
    } else if (searchActions.recentRemoved.match(action)) {
      send({
        type: 'search-recent-remove',
        kind: action.payload.kind,
        query: action.payload.query,
      });
    }
    return result;
  };
};
