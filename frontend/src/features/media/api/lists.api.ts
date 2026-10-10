import { authApi } from '@features/auth/api/auth.api';
import type { ListResponse, ListsPageResponse, ListsResponse } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

type WatchlistMembership = {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  inWatchlist: boolean;
};

export const listsApi = createApi({
  reducerPath: 'listsApi',
  tagTypes: ['Watchlist'],
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
      providesTags: ['Watchlist'],
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
      providesTags: (_result, _error, args) =>
        args.category === 'my-watchlist' ? ['Watchlist'] : [],
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
              { query: { page: String(pageParam), limit: String(queryArg?.limit ?? 20) } },
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
    getWatchlistMembership: builder.query<
      { mediaType: 'movie' | 'tv'; mediaId: number; inWatchlist: boolean },
      { mediaType: 'movie' | 'tv'; mediaId: number }
    >({
      async queryFn({ mediaType, mediaId }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<WatchlistMembership>({
          requestFn: () =>
            backendClient.api.watchlist.$get(
              { query: { mediaType, mediaId: String(mediaId) } },
              { headers }
            ),
          session: sessionId,
          errorContext: 'Failed to fetch watchlist membership',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      providesTags: (_result, _error, args) => [
        { type: 'Watchlist', id: `${args.mediaType}:${args.mediaId}` },
      ],
    }),
    addToWatchlist: builder.mutation<
      { mediaType: 'movie' | 'tv'; mediaId: number; inWatchlist: boolean },
      { mediaType: 'movie' | 'tv'; mediaId: number }
    >({
      async queryFn(item, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<WatchlistMembership>({
          requestFn: () => backendClient.api.watchlist.$post({ json: item }, { headers }),
          session: sessionId,
          errorContext: 'Failed to add to watchlist',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      invalidatesTags: ['Watchlist'],
    }),
    removeFromWatchlist: builder.mutation<
      { mediaType: 'movie' | 'tv'; mediaId: number; inWatchlist: boolean },
      { mediaType: 'movie' | 'tv'; mediaId: number }
    >({
      async queryFn(item, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<WatchlistMembership>({
          requestFn: () => backendClient.api.watchlist.$delete({ json: item }, { headers }),
          session: sessionId,
          errorContext: 'Failed to remove from watchlist',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      invalidatesTags: ['Watchlist'],
    }),
  }),
});

export const {
  useGetListsQuery,
  useGetListQuery,
  useGetPopularListsInfiniteQuery,
  usePromoteListMediaMutation,
  useGetWatchlistMembershipQuery,
  useAddToWatchlistMutation,
  useRemoveFromWatchlistMutation,
  usePrefetch,
} = listsApi;
