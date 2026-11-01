import { listsApi } from '@features/media/api/lists.api';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { homeNavigationActions, homeNavigationSlice } from '@store/slices/homeNavigation';
import type { RootState } from '@store/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { homeFeedMiddleware, wantedListPages } from './homeFeed.middleware';
import { homeFeedActions, homeFeedSlice } from './homeFeed.slice';
import { listPageArgs, selectEmptyListSlugs, selectListPage } from './listPages';

const requests = vi.hoisted(() => [] as Array<{ slug: string; page: number; priority: string }>);
const totals = vi.hoisted(() => ({ value: {} as Record<string, number> }));

vi.mock('@shared/api/backend-client', () => ({
  backendClient: {
    api: {
      list: {
        ':slug': {
          $get: ({
            param,
            query,
          }: {
            param: { slug: string };
            query: { page: string; priority: string };
          }) => {
            requests.push({ slug: param.slug, page: Number(query.page), priority: query.priority });
            return { slug: param.slug, page: Number(query.page), total: totals.value[param.slug] };
          },
        },
      },
    },
  },
}));
vi.mock('@shared/api/authenticated-request', () => ({
  authenticatedRequest: async ({ requestFn }: { requestFn: () => unknown }) => ({
    data: await requestFn(),
  }),
}));

const setupTest = (listTotals: Record<string, number> = {}) => {
  requests.length = 0;
  totals.value = listTotals;
  const store = configureStore({
    reducer: {
      [authSlice.name]: authSlice.reducer,
      [homeNavigationSlice.name]: homeNavigationSlice.reducer,
      [homeFeedSlice.name]: homeFeedSlice.reducer,
      [listsApi.reducerPath]: listsApi.reducer,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware().concat(listsApi.middleware, homeFeedMiddleware),
  });
  const state = () => store.getState() as unknown as RootState;
  const settle = () => vi.waitFor(() => expect(pendingQueries(state())).toBe(0));
  return { store, state, settle };
};

const pendingQueries = (state: RootState) =>
  Object.values(state.listsApi.queries).filter(entry => entry?.status === 'pending').length;

const subscribedPages = (state: RootState) =>
  Object.values(state.listsApi.queries)
    .filter(entry => entry && entry.status !== 'uninitialized')
    .map(entry => {
      const args = entry!.originalArgs as { category: string; page: number };
      return `${args.category}|${args.page}`;
    })
    .sort();

describe('homeFeedMiddleware', () => {
  afterEach(() => vi.useRealTimers());

  it('loads the selected page of each wanted row, with its intent', async () => {
    const { store, settle } = setupTest({ popular: 10, trending: 10 });
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible', trending: 'prefetch' }));
    await settle();

    expect(requests).toEqual([
      { slug: 'popular', page: 0, priority: 'visible' },
      { slug: 'trending', page: 0, priority: 'prefetch' },
    ]);
  });

  it('adds the neighbouring pages once the list size is known', async () => {
    const { store, state, settle } = setupTest({ popular: 70 });
    store.dispatch(homeNavigationActions.setCategorySelection({ slug: 'popular', index: 25 }));
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible' }));
    await settle();

    expect(subscribedPages(state())).toEqual(['popular|0', 'popular|1', 'popular|2']);
  });

  it('does not ask for pages past the end of the list', async () => {
    const { store, state, settle } = setupTest({ popular: 15 });
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible' }));
    await settle();

    expect(subscribedPages(state())).toEqual(['popular|0']);
  });

  it('follows the selection to the next page', async () => {
    const { store, settle } = setupTest({ popular: 100 });
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible' }));
    await settle();
    store.dispatch(homeNavigationActions.setCategorySelection({ slug: 'popular', index: 45 }));
    await settle();

    expect(requests.map(request => request.page).sort()).toEqual([0, 1, 2, 3]);
  });

  it('releases the pages of rows it no longer wants', async () => {
    const { store, state, settle } = setupTest({ popular: 10, trending: 10 });
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible', trending: 'visible' }));
    await settle();
    vi.useFakeTimers();

    store.dispatch(homeFeedActions.rowsWanted({ trending: 'visible' }));
    // The cache drops a page once it has had no subscriber for a minute.
    await vi.advanceTimersByTimeAsync(61_000);

    expect(subscribedPages(state())).toEqual(['trending|0']);
  });
});

describe('wantedListPages', () => {
  it('wants nothing until Home names its rows', () => {
    const { state } = setupTest();
    expect(wantedListPages(state()).size).toBe(0);
  });
});

describe('list page selectors', () => {
  it('reads a loaded page and the lists that loaded empty', async () => {
    const { store, state, settle } = setupTest({ popular: 3, watchlist: 0 });
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible', watchlist: 'prefetch' }));
    await settle();

    expect(selectListPage(state(), 'popular', 0)).toMatchObject({
      data: { total: 3 },
      isLoading: false,
      isError: false,
    });
    expect(selectListPage(state(), 'popular', 1).data).toBeUndefined();
    expect([...selectEmptyListSlugs(state())]).toEqual(['watchlist']);
  });

  it('keys pages without their priority', () => {
    expect(listPageArgs('popular', 2, 'prefetch')).toEqual({
      category: 'popular',
      page: 2,
      limit: 20,
      priority: 'prefetch',
    });
  });
});

describe('selectEmptyListSlugs', () => {
  it('keeps the same set while the empty lists stay the same', async () => {
    const { store, state, settle } = setupTest({ popular: 3, watchlist: 0, trending: 5 });
    store.dispatch(homeFeedActions.rowsWanted({ popular: 'visible', watchlist: 'prefetch' }));
    await settle();
    const before = selectEmptyListSlugs(state());

    store.dispatch(
      homeFeedActions.rowsWanted({
        popular: 'visible',
        watchlist: 'prefetch',
        trending: 'prefetch',
      })
    );
    await settle();

    expect(selectEmptyListSlugs(state())).toBe(before);
  });
});
