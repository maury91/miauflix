import { authApi } from '@features/auth/api/auth.api';
import type { ListResponse, ListsPageResponse, ListsResponse } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

export const listsApi = createApi({
  reducerPath: 'listsApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getLists: builder.query<ListsResponse, void>({
      async queryFn(_arg, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<ListsResponse>({
          requestFn: () => backendClient.api.lists.$get({}, { headers }),
          session: sessionId,
          errorContext: 'Failed to fetch lists',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    getList: builder.query<
      ListResponse,
      { category: string; page: number; limit?: number; priority?: 'visible' | 'prefetch' }
    >({
      serializeQueryArgs: ({ queryArgs }) => ({
        category: queryArgs.category,
        page: queryArgs.page,
        limit: queryArgs.limit ?? 20,
      }),
      async queryFn({ category, limit = 20, page, priority = 'visible' }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<ListResponse>({
          requestFn: () =>
            backendClient.api.list[':slug'].$get(
              {
                param: { slug: category },
                query: {
                  lang: 'en',
                  page: String(page),
                  limit: String(limit),
                  priority,
                },
              },
              { headers }
            ),
          session: sessionId,
          errorContext: 'Failed to fetch list',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    promoteListMedia: builder.mutation<
      { accepted: number },
      {
        items: Array<{
          mediaType: 'movie' | 'tv';
          mediaId: number;
          tier: 'visible' | 'viewport';
        }>;
      }
    >({
      async queryFn({ items }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<{ accepted: number }>({
          requestFn: () =>
            backendClient.api.list.priorities.$post({ json: { items } }, { headers }),
          session: sessionId,
          errorContext: 'Failed to promote list media priority',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),

    getPopularLists: builder.infiniteQuery<ListsPageResponse, { limit?: number }, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastPageParam) =>
          lastPageParam + 1 < lastPage.totalPages ? lastPageParam + 1 : undefined,
      },
      async queryFn({ queryArg, pageParam }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<ListsPageResponse>({
          requestFn: () =>
            backendClient.api.lists.popular.$get(
              {
                query: {
                  page: String(pageParam),
                  limit: String(queryArg?.limit ?? 20),
                },
              },
              { headers }
            ),
          session: sessionId,
          errorContext: 'Failed to fetch popular lists',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
    }),
  }),
});

export const {
  useGetListsQuery,
  useGetListQuery,
  useGetPopularListsInfiniteQuery,
  usePromoteListMediaMutation,
  usePrefetch,
} = listsApi;
