import { ROW_PAGE_SIZE } from '@features/home-feed/row-pages';
import { listsApi } from '@features/media/api/lists.api';
import type { Middleware, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '@store/store';

import { type ListPageArgs, listPageArgs, selectListPage } from './listPages';

type Subscription = { unsubscribe: () => void };

/**
 * The list pages each wanted row needs, by `category|page`: the page with the row's selection,
 * and the pages on either side once the list's size is known. Both neighbours, not only the one
 * the selection is heading to: a TV row moves its selection ahead of the one it reports.
 */
export function wantedListPages(state: RootState): Map<string, ListPageArgs> {
  const pages = new Map<string, ListPageArgs>();
  for (const [category, intent] of Object.entries(state.homeFeed.wanted)) {
    const selected = state.homeNavigation.selectedByCategory[category] ?? 0;
    const page = Math.floor(Math.max(0, selected) / ROW_PAGE_SIZE);
    const total = selectListPage(state, category, page).data?.total;
    for (const candidate of [page, page - 1, page + 1]) {
      if (candidate < 0) continue;
      if (candidate !== page && (total === undefined || candidate * ROW_PAGE_SIZE >= total))
        continue;
      pages.set(`${category}|${candidate}`, listPageArgs(category, candidate, intent));
    }
  }
  return pages;
}

/**
 * Loads Home's list pages outside React. Home says which rows it wants (homeFeedActions.rowsWanted)
 * and each row's selection is in homeNavigation; this keeps one cache subscription per page they
 * need and drops the rest, so rows only read pages (useListPage) and never fetch them.
 */
export const homeFeedMiddleware: Middleware = store => {
  const subscriptions = new Map<string, Subscription>();
  const dispatch = store.dispatch as ThunkDispatch<RootState, unknown, UnknownAction>;

  const reconcile = () => {
    const wanted = wantedListPages(store.getState() as RootState);
    for (const [key, subscription] of subscriptions) {
      if (wanted.has(key)) continue;
      subscription.unsubscribe();
      subscriptions.delete(key);
    }
    for (const [key, args] of wanted) {
      if (subscriptions.has(key)) continue;
      subscriptions.set(key, dispatch(listsApi.endpoints.getList.initiate(args)));
    }
  };

  return next => action => {
    const before = store.getState() as RootState;
    const result = next(action);
    const after = store.getState() as RootState;
    if (
      after.homeFeed !== before.homeFeed ||
      after.homeNavigation.selectedByCategory !== before.homeNavigation.selectedByCategory ||
      listsApi.endpoints.getList.matchFulfilled(action)
    )
      reconcile();
    return result;
  };
};
