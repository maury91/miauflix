import { authApi } from '@features/auth/api/auth.api';
import type {
  ApiErrorBody,
  SearchGenreDto,
  SearchGenreKey,
  SearchRecentDto,
  SearchResultDetailDto,
  SearchResultDto,
  SearchServerMessage,
} from '@miauflix/backend';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { clearAuth, setSession } from '@store/slices/auth';

/**
 * `back` is the back button on the page's rail; `state` holds the actions of the no-results or
 * error panel shown instead of results (the main action, then "Technical details").
 */
export type SearchZone =
  | 'back'
  | 'input'
  | 'keyboard'
  | 'popular'
  | 'recents'
  | 'results'
  | 'state';

export interface SearchFocus {
  zone: SearchZone;
  index: number;
}

export interface SearchState {
  /** Text shown in the search box; a selected genre shows its name. */
  query: string;
  genre: SearchGenreKey | null;
  status: 'error' | 'idle' | 'loading' | 'ready';
  /** Why the active search failed, as the server explained it (null when unknown). */
  error: ApiErrorBody | null;
  /** Request id of the first page of the active search; older answers are ignored. */
  requestId: number;
  /** Request id of the page being appended, if any. */
  moreRequestId: number | null;
  results: SearchResultDto[];
  page: number;
  totalPages: number;
  totalResults: number;
  /** Runtime / season count by `${_type}:${mediaId}`, filled in after the results. */
  details: Record<string, SearchResultDetailDto>;
  recents: SearchRecentDto[];
  /** Genre chips from the catalog, most titles first, then shortcuts such as Anime. */
  genres: SearchGenreDto[];
  focus: SearchFocus;
  /** Last character key on the on-screen keyboard that had focus, to return to it. */
  lastKey: number;
}

export const initialSearchState: SearchState = {
  query: '',
  genre: null,
  status: 'idle',
  error: null,
  requestId: 0,
  moreRequestId: null,
  results: [],
  page: 0,
  totalPages: 0,
  totalResults: 0,
  details: {},
  recents: [],
  genres: [],
  focus: { zone: 'keyboard', index: 0 },
  lastKey: 0,
};

export const searchResultKey = (item: { _type: string; mediaId: number }) =>
  `${item._type}:${item.mediaId}`;

const clearResults = (state: SearchState) => {
  state.status = 'idle';
  state.error = null;
  state.moreRequestId = null;
  state.results = [];
  state.page = 0;
  state.totalPages = 0;
  state.totalResults = 0;
  state.details = {};
};

export const searchSlice = createSlice({
  name: 'search',
  initialState: initialSearchState,
  reducers: {
    /** Typing replaces any genre shortcut with a title search. */
    queryChanged(state, action: PayloadAction<string>) {
      state.query = action.payload.slice(0, 100);
      state.genre = null;
      if (!state.query.trim()) clearResults(state);
    },
    genreSelected(state, action: PayloadAction<SearchGenreDto>) {
      state.genre = action.payload.key;
      state.query = action.payload.name;
    },
    recentSelected(state, action: PayloadAction<SearchRecentDto>) {
      if (action.payload.kind === 'genre') {
        state.genre = action.payload.query as SearchGenreKey;
        state.query = action.payload.label;
      } else {
        state.genre = null;
        state.query = action.payload.query;
      }
    },
    /** Explicit submit (search key / Enter); the middleware sends it immediately. */
    submitted() {},
    /** Runs the current search again after it failed, without recording it as recent. */
    retryRequested() {},
    nextPageRequested() {},
    resultOpened(_state, _action: PayloadAction<SearchResultDto>) {},
    recentsRequested() {},
    genresRequested() {},
    recentRemoved(state, action: PayloadAction<SearchRecentDto>) {
      state.recents = state.recents.filter(
        recent => recent.kind !== action.payload.kind || recent.query !== action.payload.query
      );
    },
    searchStarted(state, action: PayloadAction<{ requestId: number; page: number }>) {
      if (action.payload.page === 1) {
        state.requestId = action.payload.requestId;
        state.moreRequestId = null;
        state.status = 'loading';
        state.error = null;
      } else {
        state.moreRequestId = action.payload.requestId;
        state.error = null;
      }
    },
    serverMessage(state, action: PayloadAction<SearchServerMessage>) {
      const message = action.payload;
      if (message.type === 'search-recents') {
        state.recents = message.items;
        return;
      }
      if (message.type === 'search-genres') {
        state.genres = message.items;
        return;
      }
      // Ids grow monotonically, so anything older than the active search's first page is stale.
      if (message.requestId < state.requestId || state.status === 'idle') return;
      if (message.type === 'search-results') {
        if (message.requestId === state.requestId) {
          state.results = message.results;
          state.details = {};
          state.status = 'ready';
        } else if (message.requestId === state.moreRequestId) {
          const seen = new Set(state.results.map(searchResultKey));
          state.results.push(...message.results.filter(item => !seen.has(searchResultKey(item))));
          state.moreRequestId = null;
        } else {
          return;
        }
        state.page = message.page;
        state.totalPages = message.totalPages;
        state.totalResults = message.totalResults;
      } else if (message.type === 'search-details') {
        for (const item of message.items) state.details[searchResultKey(item)] = item;
      } else if (message.requestId === state.moreRequestId) {
        // The pages already shown stay usable; the failure is shown beside them.
        state.moreRequestId = null;
        state.error = message.error ?? null;
      } else if (message.requestId === state.requestId) {
        // After its results arrived, only the details lookup can fail: keep the results usable.
        if (state.status !== 'ready') state.status = 'error';
        state.error = message.error ?? null;
      }
    },
    focusChanged(state, action: PayloadAction<SearchFocus>) {
      state.focus = action.payload;
    },
    keyRemembered(state, action: PayloadAction<number>) {
      state.lastKey = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(clearAuth, () => initialSearchState)
      .addCase(setSession, () => initialSearchState)
      .addMatcher(authApi.endpoints.logout.matchFulfilled, () => initialSearchState);
  },
});

export const searchActions = searchSlice.actions;
