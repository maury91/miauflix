import { authApi } from '@features/auth/api/auth.api';
import type { ListResponse, ListsResponse } from '@miauflix/backend';
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

    getList: builder.query<ListResponse, { category: string; page: number; limit?: number }>({
      async queryFn({ category, limit = 20, page }, { getState, dispatch }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return authenticatedRequest<ListResponse>({
          requestFn: () =>
            backendClient.api.list[':slug'].$get(
              {
                param: { slug: category },
                query: { lang: 'en', page: String(page), limit: String(limit) },
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
  }),
});

export const { useGetListsQuery, useGetListQuery, usePrefetch } = listsApi;
