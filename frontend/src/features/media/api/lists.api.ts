import type { ListResponse, ListsResponse } from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

async function handleListsRequest<T>(
  requestFn: () => Promise<Response>,
  errorContext: string
): Promise<{ data: T } | { error: { status: number; data: string } }> {
  try {
    const res = await requestFn();
    if (res.status >= 200 && res.status < 300) {
      const data: T = await res.json();
      return { data };
    }

    const responseData = await res.json();
    const errorMessage =
      'error' in responseData && typeof responseData.error === 'string'
        ? responseData.error
        : errorContext;
    return {
      error: {
        status: res.status,
        data: errorMessage,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStatus = (error as { status?: number })?.status || 500;
    return {
      error: { status: errorStatus, data: errorMessage },
    };
  }
}

export const listsApi = createApi({
  reducerPath: 'listsApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    getLists: builder.query<ListsResponse, void>({
      async queryFn(_arg, { getState }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return handleListsRequest<ListsResponse>(
          () => backendClient.api.lists.$get({}, { headers }),
          'Failed to fetch lists'
        );
      },
    }),

    getList: builder.query<ListResponse, { category: string; page: number }>({
      async queryFn({ category }, { getState }) {
        const sessionId = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = sessionId ? { 'X-Session-Id': sessionId } : {};
        return handleListsRequest<ListResponse>(
          () =>
            backendClient.api.list[':slug'].$get(
              {
                param: { slug: category },
                query: { lang: 'en' },
              },
              { headers }
            ),
          'Failed to fetch list'
        );
      },
    }),
  }),
});

export const { useGetListsQuery, useGetListQuery, usePrefetch } = listsApi;
