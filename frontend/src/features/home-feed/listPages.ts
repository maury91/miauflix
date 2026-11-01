import { listsApi } from '@features/media/api/lists.api';
import type { ListResponse } from '@miauflix/backend';
import { ROW_PAGE_SIZE } from '@pages/home/row-pages';
import { createSelector } from '@reduxjs/toolkit';
import { skipToken } from '@reduxjs/toolkit/query';
import type { RootState } from '@store/store';
import { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

export interface ListPageArgs {
  category: string;
  page: number;
  limit: number;
  priority: 'visible' | 'prefetch';
}

/** The list page `page` of `category`, as Home requests it (the priority is not part of the key). */
export const listPageArgs = (
  category: string,
  page: number,
  priority: ListPageArgs['priority'] = 'visible'
): ListPageArgs => ({ category, page, limit: ROW_PAGE_SIZE, priority });

/** A list page from the cache, in the shape the rows read it. */
export interface ListPageView {
  data: ListResponse | undefined;
  currentData: ListResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}

const NOT_REQUESTED: ListPageView = {
  data: undefined,
  currentData: undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
};

const pageSelectors = new Map<string, ReturnType<typeof listsApi.endpoints.getList.select>>();
/** One selector per page, so reading a page does not build a selector each time. */
const pageSelector = (category: string, page: number) => {
  const key = `${category}|${page}`;
  let selector = pageSelectors.get(key);
  if (!selector) {
    selector = listsApi.endpoints.getList.select(listPageArgs(category, page));
    pageSelectors.set(key, selector);
  }
  return selector;
};

export const selectListPage = (state: RootState, category: string, page: number): ListPageView => {
  const entry = pageSelector(category, page)(state);
  if (entry.isUninitialized) return NOT_REQUESTED;
  return {
    data: entry.data,
    currentData: entry.data,
    isLoading: entry.isLoading && !entry.data,
    isFetching: entry.isLoading,
    isError: entry.isError,
  };
};

/**
 * Read a list page from the cache. It never fetches: homeFeedMiddleware loads the pages of the
 * rows Home wants, so a row only renders what is there.
 */
export function useListPage(args: ListPageArgs | typeof skipToken): ListPageView {
  const category = args === skipToken ? null : args.category;
  const page = args === skipToken ? null : args.page;
  const select = useMemo(
    () =>
      category === null || page === null
        ? () => NOT_REQUESTED
        : (state: RootState) => selectListPage(state, category, page),
    [category, page]
  );
  return useSelector(select, shallowEqual);
}

const sameSlugs = (left: ReadonlySet<string>, right: ReadonlySet<string>) =>
  left.size === right.size && [...left].every(slug => right.has(slug));

/**
 * The lists that loaded with nothing in them: Home leaves them out. The same set while its
 * slugs stay the same, so a page loading elsewhere does not re-render Home.
 */
export const selectEmptyListSlugs = createSelector(
  [(state: RootState) => state[listsApi.reducerPath].queries],
  (queries): ReadonlySet<string> => {
    const empty = new Set<string>();
    for (const entry of Object.values(queries)) {
      if (entry?.endpointName !== 'getList') continue;
      const data = entry.data as ListResponse | undefined;
      if (data?.total === 0) empty.add((entry.originalArgs as unknown as ListPageArgs).category);
    }
    return empty;
  },
  { memoizeOptions: { resultEqualityCheck: sameSlugs } }
);
